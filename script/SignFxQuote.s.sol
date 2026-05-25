// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {IFxEscrow} from "../src/interfaces/IFxEscrow.sol";

/// @title SignFxQuote
/// @notice Replicates `FxEscrowAdapter`'s exact EIP-712 digest computation,
///         signs with `MAKER_PK` (= `DEPLOYER_PK` in the v1 D-008 setup),
///         and writes the abi-encoded `(Quote, sig)` payload to
///         `deployments/fx-quote-extra-data.hex` so that
///         `script/smoke-test-fx-escrow-arc.sh` can read it and pass it
///         as `extraData` to `BatchRouter.execute`.
///
/// @dev Run as a dry-run (no broadcast):
///        forge script script/SignFxQuote.s.sol --rpc-url arc_testnet
///
/// @dev Required env:
///        MAKER_PK            private key for the maker (= DEPLOYER_PK here)
///        ADAPTER_ADDR        FxEscrowAdapter address (= verifyingContract)
///        QUOTE_TOKEN_IN      address (USDC)
///        QUOTE_TOKEN_OUT     address (EURC)
///        QUOTE_AMOUNT_IN     uint256 base units of tokenIn
///        QUOTE_AMOUNT_OUT    uint256 base units of tokenOut
///        QUOTE_TAKER         address (= ADAPTER_ADDR)
///        QUOTE_EXPIRY        uint256 unix seconds
///        QUOTE_NONCE         uint256
contract SignFxQuote is Script {
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address maker,address taker,uint256 expiry,uint256 nonce)"
    );

    function run() external {
        uint256 makerPk = vm.envUint("MAKER_PK");
        address makerAddr = vm.addr(makerPk);
        address adapter = vm.envAddress("ADAPTER_ADDR");

        IFxEscrow.Quote memory q = IFxEscrow.Quote({
            tokenIn: vm.envAddress("QUOTE_TOKEN_IN"),
            tokenOut: vm.envAddress("QUOTE_TOKEN_OUT"),
            amountIn: vm.envUint("QUOTE_AMOUNT_IN"),
            amountOut: vm.envUint("QUOTE_AMOUNT_OUT"),
            maker: makerAddr,
            taker: vm.envAddress("QUOTE_TAKER"),
            expiry: vm.envUint("QUOTE_EXPIRY"),
            nonce: vm.envUint("QUOTE_NONCE")
        });

        // Replicate FxEscrowAdapter's domain separator EXACTLY.
        bytes32 domainSep = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Conduit-FxEscrowAdapter")),
                keccak256(bytes("1")),
                block.chainid,
                adapter
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.tokenIn,
                q.tokenOut,
                q.amountIn,
                q.amountOut,
                q.maker,
                q.taker,
                q.expiry,
                q.nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        console2.log("==================================================");
        console2.log("Sign FX Quote (EIP-712, FxEscrowAdapter domain)");
        console2.log("==================================================");
        console2.log("chainId:        ", block.chainid);
        console2.log("verifyingContract:", adapter);
        console2.log("maker / signer: ", makerAddr);
        console2.log("digest:         ");
        console2.logBytes32(digest);
        console2.log("--------------------------------------------------");

        // abi-encode the (Quote, sig) tuple — exactly what
        // FxEscrowAdapter.swap expects to receive in extraData.
        bytes memory extraData = abi.encode(q, sig);

        // Write hex form to a file. cast send can read it via $(cat).
        vm.writeFile("./deployments/fx-quote-extra-data.hex", vm.toString(extraData));
        console2.log("Wrote deployments/fx-quote-extra-data.hex");
        console2.log("Length:         ", extraData.length, "bytes");
    }
}
