// packages
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import chai from "chai"
import { BigNumber } from "ethers"
import { network, deployments, ethers, getNamedAccounts } from "hardhat"
import { solidity } from "ethereum-waffle"

// utils
import { developmentChains, networkConfig } from "../../helper-hardhat-config"
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types"

chai.use(solidity)

const { assert, expect } = chai

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", async function () {
          let raffle: Raffle
          let vrfCoordinatorV2: VRFCoordinatorV2Mock
          let raffleEntranceFee: BigNumber
          let player: SignerWithAddress
          let accounts: SignerWithAddress[]
          const chainId: number = network.config.chainId!

          beforeEach(async function () {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              player = accounts[1]
              await deployments.fixture(["all"])

              raffle = await ethers.getContract("Raffle", player)
              vrfCoordinatorV2 = await ethers.getContract("VRFCoordinatorV2Mock", player)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("constructor", async function () {
              it("initialized the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()

                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"])
              })
          })

          describe("enter raffle", async function () {
              it("reverts if you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughEthEnter")
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, player.address)
              })

              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })

              it("doesn't allow entrance of raffle if it is calculating", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee }))
              })
          })
      })
