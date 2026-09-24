// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaTokenService } from "../interfaces/IHederaTokenService.sol";

/// @notice Fungible token created by MockHederaTokenService. Exposes the ERC-20 read facade and HIP-719
/// `associate()` that real HTS tokens expose at their EVM address.
contract MockHtsToken {
    address public immutable HTS;
    address public immutable TREASURY;
    address public immutable KEY_HOLDER;
    uint8 public immutable decimals;

    string public name;
    string public symbol;
    uint256 public totalSupply;

    mapping(address account => uint256) public balanceOf;
    mapping(address account => bool) public isAssociated;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address treasury, address keyHolder) {
        HTS = msg.sender;
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        TREASURY = treasury;
        KEY_HOLDER = keyHolder;
        isAssociated[treasury] = true;
    }

    modifier onlyHts() {
        require(msg.sender == HTS, "only HTS");
        _;
    }

    function associate() external returns (uint256 responseCode) {
        isAssociated[msg.sender] = true;
        return 22;
    }

    function mintToTreasury(uint256 amount) external onlyHts {
        totalSupply += amount;
        balanceOf[TREASURY] += amount;
    }

    function burnFromTreasury(uint256 amount) external onlyHts {
        totalSupply -= amount;
        balanceOf[TREASURY] -= amount;
    }

    function move(address from, address to, uint256 amount) external onlyHts {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice NFT collection created by MockHederaTokenService, exposing the ERC-721 read facade real HTS NFTs have.
contract MockHtsNft {
    address public immutable HTS;
    address public immutable TREASURY;
    address public immutable KEY_HOLDER;

    string public name;
    string public symbol;
    uint256 public totalSupply;

    mapping(uint256 serial => address) public ownerOf;
    mapping(uint256 serial => bytes) private _metadata;
    mapping(address account => uint256) public balanceOf;
    mapping(address account => bool) public isAssociated;

    constructor(string memory name_, string memory symbol_, address treasury, address keyHolder) {
        HTS = msg.sender;
        name = name_;
        symbol = symbol_;
        TREASURY = treasury;
        KEY_HOLDER = keyHolder;
        isAssociated[treasury] = true;
    }

    modifier onlyHts() {
        require(msg.sender == HTS, "only HTS");
        _;
    }

    function associate() external returns (uint256 responseCode) {
        isAssociated[msg.sender] = true;
        return 22;
    }

    function tokenURI(uint256 serial) external view returns (string memory) {
        return string(_metadata[serial]);
    }

    function mintToTreasury(bytes memory metadata) external onlyHts returns (uint256 serial) {
        serial = ++totalSupply;
        ownerOf[serial] = TREASURY;
        _metadata[serial] = metadata;
        balanceOf[TREASURY] += 1;
    }

    function move(address from, address to, uint256 serial) external onlyHts {
        ownerOf[serial] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
    }
}

/// @notice Local stand-in for the HTS system contract, installed at 0x167 with `hardhat_setCode`.
/// @dev Models the behaviours the template relies on: response codes instead of reverts, supply-key checks,
/// treasury-only mint/burn and the association requirement on transfers.
contract MockHederaTokenService {
    int64 internal constant SUCCESS = 22;
    int64 internal constant INVALID_SIGNATURE = 7;
    int64 internal constant INSUFFICIENT_TOKEN_BALANCE = 178;
    int64 internal constant TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184;
    int64 internal constant SENDER_DOES_NOT_OWN_NFT_SERIAL_NO = 237;
    int64 internal constant METADATA_TOO_LONG = 199;

    mapping(address token => bool) public isNft;

    /// @dev Non-zero forces every call to return this code, to exercise failure handling.
    int64 public forcedResponseCode;

    function setForcedResponseCode(int64 code) external {
        forcedResponseCode = code;
    }

    function createFungibleToken(
        IHederaTokenService.HederaToken memory token,
        int64 initialTotalSupply,
        int32 decimals
    ) external payable returns (int64 responseCode, address tokenAddress) {
        if (forcedResponseCode != 0) return (forcedResponseCode, address(0));

        address keyHolder = token.tokenKeys.length > 0 ? token.tokenKeys[0].key.contractId : address(0);
        MockHtsToken created = new MockHtsToken(
            token.name,
            token.symbol,
            uint8(uint32(decimals)),
            token.treasury,
            keyHolder
        );
        if (initialTotalSupply > 0) created.mintToTreasury(uint64(initialTotalSupply));
        return (SUCCESS, address(created));
    }

    function createNonFungibleToken(
        IHederaTokenService.HederaToken memory token
    ) external payable returns (int64 responseCode, address tokenAddress) {
        if (forcedResponseCode != 0) return (forcedResponseCode, address(0));

        address keyHolder = token.tokenKeys.length > 0 ? token.tokenKeys[0].key.contractId : address(0);
        MockHtsNft created = new MockHtsNft(token.name, token.symbol, token.treasury, keyHolder);
        isNft[address(created)] = true;
        return (SUCCESS, address(created));
    }

    function transferNFT(
        address token,
        address sender,
        address recipient,
        int64 serialNumber
    ) external returns (int64) {
        if (forcedResponseCode != 0) return forcedResponseCode;
        MockHtsNft nft = MockHtsNft(token);
        if (msg.sender != sender) return INVALID_SIGNATURE;
        if (nft.ownerOf(uint64(serialNumber)) != sender) return SENDER_DOES_NOT_OWN_NFT_SERIAL_NO;
        if (!nft.isAssociated(recipient)) return TOKEN_NOT_ASSOCIATED_TO_ACCOUNT;

        nft.move(sender, recipient, uint64(serialNumber));
        return SUCCESS;
    }

    function mintToken(
        address token,
        int64 amount,
        bytes[] memory metadata
    ) external returns (int64 responseCode, int64 newTotalSupply, int64[] memory serialNumbers) {
        if (forcedResponseCode != 0) return (forcedResponseCode, 0, serialNumbers);
        if (isNft[token]) return _mintNfts(MockHtsNft(token), metadata);
        MockHtsToken t = MockHtsToken(token);
        if (msg.sender != t.KEY_HOLDER()) return (INVALID_SIGNATURE, 0, serialNumbers);

        t.mintToTreasury(uint64(amount));
        return (SUCCESS, int64(uint64(t.totalSupply())), serialNumbers);
    }

    function _mintNfts(
        MockHtsNft nft,
        bytes[] memory metadata
    ) private returns (int64 responseCode, int64 newTotalSupply, int64[] memory serialNumbers) {
        if (msg.sender != nft.KEY_HOLDER()) return (INVALID_SIGNATURE, 0, serialNumbers);
        serialNumbers = new int64[](metadata.length);
        for (uint256 i = 0; i < metadata.length; i++) {
            if (metadata[i].length > 100) return (METADATA_TOO_LONG, 0, new int64[](0));
            serialNumbers[i] = int64(uint64(nft.mintToTreasury(metadata[i])));
        }
        return (SUCCESS, int64(uint64(nft.totalSupply())), serialNumbers);
    }

    function burnToken(address token, int64 amount, int64[] memory) external returns (int64, int64) {
        if (forcedResponseCode != 0) return (forcedResponseCode, 0);
        MockHtsToken t = MockHtsToken(token);
        if (msg.sender != t.KEY_HOLDER()) return (INVALID_SIGNATURE, 0);
        if (t.balanceOf(t.TREASURY()) < uint64(amount)) return (INSUFFICIENT_TOKEN_BALANCE, 0);

        t.burnFromTreasury(uint64(amount));
        return (SUCCESS, int64(uint64(t.totalSupply())));
    }

    function transferToken(address token, address sender, address recipient, int64 amount) external returns (int64) {
        if (forcedResponseCode != 0) return forcedResponseCode;
        MockHtsToken t = MockHtsToken(token);
        if (msg.sender != sender) return INVALID_SIGNATURE;
        if (!t.isAssociated(recipient)) return TOKEN_NOT_ASSOCIATED_TO_ACCOUNT;
        if (t.balanceOf(sender) < uint64(amount)) return INSUFFICIENT_TOKEN_BALANCE;

        t.move(sender, recipient, uint64(amount));
        return SUCCESS;
    }
}
