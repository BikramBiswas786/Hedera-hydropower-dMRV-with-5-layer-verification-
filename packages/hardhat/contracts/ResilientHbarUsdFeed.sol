// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { ISupraSValueFeed } from "./interfaces/ISupraSValueFeed.sol";

/// @title ResilientHbarUsdFeed
/// @notice HBAR/USD price with Chainlink as the primary source and Supra as an independent fallback, exposed through
/// Chainlink's `AggregatorV3Interface` so any consumer can use it unchanged.
/// @dev Rules, in order:
/// - Both sources fresh: they must agree within `MAX_DEVIATION_BPS`, otherwise the feed refuses to answer. A single
///   manipulated or broken source therefore cannot price a settlement.
/// - One source fresh: its answer is used. Chainlink outages fall back to Supra and vice versa.
/// - Neither fresh: revert.
/// Supra's Hedera pair is HBAR/USDT; the deviation bound also absorbs small USDT/USD basis.
contract ResilientHbarUsdFeed is AggregatorV3Interface {
    uint8 public constant override decimals = 8;
    uint256 internal constant MAX_BPS = 10_000;
    /// @dev Timestamps above this are milliseconds (seconds stay below it until the year 5138).
    uint256 internal constant MILLISECOND_THRESHOLD = 1e11;

    AggregatorV3Interface public immutable PRIMARY;
    uint8 public immutable PRIMARY_DECIMALS;
    ISupraSValueFeed public immutable FALLBACK;
    uint256 public immutable FALLBACK_PAIR_ID;
    uint256 public immutable MAX_AGE;
    uint256 public immutable MAX_DEVIATION_BPS;

    enum Source {
        None,
        Primary,
        Fallback
    }

    struct Reading {
        int256 answer;
        uint256 updatedAt;
        bool fresh;
    }

    error NoFreshPrice();
    error PriceSourcesDisagree(int256 primaryAnswer, int256 fallbackAnswer, uint256 deviationBps);
    error InvalidConfig();

    /// @param primary Chainlink HBAR/USD aggregator.
    /// @param fallbackFeed Supra push oracle.
    /// @param fallbackPairId Supra pair index for HBAR/USDT (75 on Hedera).
    /// @param maxAge Maximum age in seconds for either source to count as fresh.
    /// @param maxDeviationBps Maximum disagreement between fresh sources, in basis points.
    constructor(
        AggregatorV3Interface primary,
        ISupraSValueFeed fallbackFeed,
        uint256 fallbackPairId,
        uint256 maxAge,
        uint256 maxDeviationBps
    ) {
        if (address(primary) == address(0) || address(fallbackFeed) == address(0)) revert InvalidConfig();
        if (maxAge == 0 || maxDeviationBps == 0 || maxDeviationBps > MAX_BPS) revert InvalidConfig();
        PRIMARY = primary;
        PRIMARY_DECIMALS = primary.decimals();
        FALLBACK = fallbackFeed;
        FALLBACK_PAIR_ID = fallbackPairId;
        MAX_AGE = maxAge;
        MAX_DEVIATION_BPS = maxDeviationBps;
    }

    function description() external pure override returns (string memory) {
        return "HBAR / USD (Chainlink, Supra fallback)";
    }

    /// @notice The price consumers should use, following the rules in the contract docs. Answers have 8 decimals.
    /// @dev `roundId` and `answeredInRound` are both the answer's timestamp, so Chainlink-style completeness checks pass.
    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        (Reading memory answer, ) = resolve();
        uint80 round = uint80(answer.updatedAt);
        return (round, answer.answer, answer.updatedAt, answer.updatedAt, round);
    }

    /// @notice Which source currently prices HBAR. Reverts exactly when `latestRoundData` does.
    function resolve() public view returns (Reading memory answer, Source source) {
        (Reading memory primary, Reading memory secondary) = readSources();

        if (primary.fresh && secondary.fresh) {
            uint256 deviation = _deviationBps(primary.answer, secondary.answer);
            if (deviation > MAX_DEVIATION_BPS) revert PriceSourcesDisagree(primary.answer, secondary.answer, deviation);
            return (primary, Source.Primary);
        }
        if (primary.fresh) return (primary, Source.Primary);
        if (secondary.fresh) return (secondary, Source.Fallback);
        revert NoFreshPrice();
    }

    /// @notice Both sources normalised to 8 decimals, for dashboards and agents. Never reverts.
    function readSources() public view returns (Reading memory primary, Reading memory secondary) {
        return (_readPrimary(), _readFallback());
    }

    function _readPrimary() private view returns (Reading memory reading) {
        try PRIMARY.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            if (answer <= 0 || updatedAt == 0 || answeredInRound < roundId) return reading;
            reading = _reading(uint256(answer), PRIMARY_DECIMALS, updatedAt);
        } catch {
            return reading;
        }
    }

    function _readFallback() private view returns (Reading memory reading) {
        try FALLBACK.getSvalue(FALLBACK_PAIR_ID) returns (ISupraSValueFeed.PriceFeed memory feed) {
            if (feed.price == 0 || feed.time == 0 || feed.decimals > 36) return reading;
            uint256 updatedAt = feed.time > MILLISECOND_THRESHOLD ? feed.time / 1_000 : feed.time;
            reading = _reading(feed.price, feed.decimals, updatedAt);
        } catch {
            return reading;
        }
    }

    /// @dev Normalises to 8 decimals. A value that rounds to zero is treated as no reading.
    function _reading(uint256 value, uint256 fromDecimals, uint256 updatedAt) private view returns (Reading memory) {
        uint256 scaled = fromDecimals >= decimals
            ? value / 10 ** (fromDecimals - decimals)
            : value * 10 ** (decimals - fromDecimals);
        if (scaled == 0) return Reading(0, 0, false);
        bool fresh = updatedAt <= block.timestamp && block.timestamp - updatedAt <= MAX_AGE;
        return Reading(int256(scaled), updatedAt, fresh);
    }

    function _deviationBps(int256 a, int256 b) private pure returns (uint256) {
        uint256 high = uint256(a > b ? a : b);
        uint256 low = uint256(a > b ? b : a);
        return ((high - low) * MAX_BPS) / low;
    }
}
