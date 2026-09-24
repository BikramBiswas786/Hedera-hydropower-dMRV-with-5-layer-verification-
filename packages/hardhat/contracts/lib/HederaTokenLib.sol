// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaTokenService } from "../interfaces/IHederaTokenService.sol";

/// @notice Thin wrapper over the HTS system contract that turns non-SUCCESS response codes into reverts.
/// @dev HTS does not revert on failure; it returns a response code. Ignoring it silently loses tokens.
library HederaTokenLib {
    IHederaTokenService internal constant HTS = IHederaTokenService(address(0x167));

    int64 internal constant SUCCESS = 22;

    /// @dev Key type bit flags from HIP-206: ADMIN=1, KYC=2, FREEZE=4, WIPE=8, SUPPLY=16, FEE=32, PAUSE=64.
    uint256 internal constant ADMIN_KEY = 1;
    uint256 internal constant SUPPLY_KEY = 16;

    /// @dev ~90 days; HTS requires an auto-renew period between 30 and 92 days.
    int64 internal constant AUTO_RENEW_PERIOD = 7_776_000;

    error HtsCallFailed(bytes4 selector, int64 responseCode);
    error HtsAmountOverflow(uint256 amount);

    /// @notice Creates an infinite-supply fungible token whose treasury, admin and supply key are this contract.
    /// @dev `msg.value` of the caller must cover the HTS creation fee; it is forwarded as `fee`.
    function createContractOwnedToken(
        string memory name,
        string memory symbol,
        string memory memo,
        int32 decimals,
        uint256 fee
    ) internal returns (address token) {
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = IHederaTokenService.TokenKey({
            keyType: ADMIN_KEY | SUPPLY_KEY,
            key: IHederaTokenService.KeyValue({
                inheritAccountKey: false,
                contractId: address(this),
                ed25519: "",
                ECDSA_secp256k1: "",
                delegatableContractId: address(0)
            })
        });

        IHederaTokenService.HederaToken memory definition = IHederaTokenService.HederaToken({
            name: name,
            symbol: symbol,
            treasury: address(this),
            memo: memo,
            tokenSupplyType: false,
            maxSupply: 0,
            freezeDefault: false,
            tokenKeys: keys,
            expiry: IHederaTokenService.Expiry({
                second: 0,
                autoRenewAccount: address(this),
                autoRenewPeriod: AUTO_RENEW_PERIOD
            })
        });

        int64 code;
        (code, token) = HTS.createFungibleToken{ value: fee }(definition, 0, decimals);
        _check(IHederaTokenService.createFungibleToken.selector, code);
    }

    /// @notice Mints `amount` units into the token treasury.
    function mint(address token, uint256 amount) internal {
        (int64 code, , ) = HTS.mintToken(token, _toInt64(amount), new bytes[](0));
        _check(IHederaTokenService.mintToken.selector, code);
    }

    /// @notice Burns `amount` units from the token treasury.
    function burn(address token, uint256 amount) internal {
        (int64 code, ) = HTS.burnToken(token, _toInt64(amount), new int64[](0));
        _check(IHederaTokenService.burnToken.selector, code);
    }

    /// @notice Transfers `amount` units out of this contract. The recipient must be associated with the token.
    function transferFromSelf(address token, address to, uint256 amount) internal {
        int64 code = HTS.transferToken(token, address(this), to, _toInt64(amount));
        _check(IHederaTokenService.transferToken.selector, code);
    }

    function _toInt64(uint256 amount) private pure returns (int64) {
        if (amount > uint256(uint64(type(int64).max))) revert HtsAmountOverflow(amount);
        return int64(uint64(amount));
    }

    function _check(bytes4 selector, int64 code) private pure {
        if (code != SUCCESS) revert HtsCallFailed(selector, code);
    }
}
