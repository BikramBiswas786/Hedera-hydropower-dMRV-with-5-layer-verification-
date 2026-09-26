// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Records the swap a purchase must make. It does not move a real token.
contract MockSaucerRouter {
    mapping(address to => uint256) public paidUsd;
    uint256 public lastValue;
    bool public revertNext;

    function setRevertNext(bool value) external {
        revertNext = value;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external payable returns (uint256[] memory amounts) {
        if (revertNext) revert("router");
        require(path.length == 2 && path[0] != address(0) && path[1] != address(0), "path");
        require(msg.value > 0 && amountOutMin > 0, "amount");
        lastValue = msg.value;
        paidUsd[to] += amountOutMin;
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = amountOutMin;
    }
}
