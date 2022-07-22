// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Import this file to use console.log
import 'hardhat/console.sol';

// Error coes
error Raffle__NotEnoughEthEnter();

contract Raffle {
    // State varialles
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;

    // Events
    event RaffleEnter(address indexed player);

    constructor(uint256 entranceFee) {
        i_entranceFee = entranceFee;
    }

    function enterRaffle() public payable {
        // requre that msg.value > i_entranceFee
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughEthEnter();
        }

        s_players.push(payable(msg.sender));
        // Named events with the function name reversed
        emit RaffleEnter(msg.sender);
    }

    // function pickRandomWinner() {}

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }
}
