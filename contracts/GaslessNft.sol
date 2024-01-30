// SPDX-License-Identifier: MIT
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

pragma solidity ^0.8.13;

contract GaslessNft is ERC721 {
    uint256 public number;
    address public last;
    address immutable _trustedForwarder;
    event Minted(
        address indexed _from, uint256 _tokenId
    );

    constructor(address trustedForwarder) ERC721("GaslessNft", "GNFT") {
        _trustedForwarder = trustedForwarder;
    }

    function setNumber(uint256 newNumber) public {
        number = newNumber;

        last = _getMsgSender(); // not "msg.sender"
    }

    function mint() public returns (uint256) {
        uint256 tokenId = number;
        address msgSender = _getMsgSender();
        _safeMint(msgSender, tokenId);

        emit Minted(msgSender, tokenId);

        number++;
        last = msgSender;
        
        return tokenId;
    }


    function getNumber() public view returns (uint256) {
        return number;
    }

    function getLast() public view returns (address) {
        return last;
    }

    function isTrustedForwarder(address forwarder) public view returns(bool) {
        return forwarder == _trustedForwarder;
    }

    function _getMsgSender() internal view returns (address payable signer) {
        if ( msg.data.length >= 20 && isTrustedForwarder(msg.sender)) {
            assembly {
                signer := shr(96, calldataload(sub(calldatasize(), 20)))    
            }
        } else {
            signer = payable(msg.sender);
        }
        return signer;
    }
}
