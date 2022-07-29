// packages
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import chai from "chai"
import { BigNumber } from "ethers"
import { network, deployments, ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

// utils
import { developmentChains, networkConfig } from "../../helper-hardhat-config"
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types"

chai.use(solidity)

/** @type {any} */
const { assert, expect } = chai

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", async function () {
          let raffle: Raffle
          let vrfCoordinatorV2: VRFCoordinatorV2Mock
          let raffleEntranceFee: BigNumber
          let player: SignerWithAddress
          let accounts: SignerWithAddress[]
          let interval: BigNumber
          let gasCost: BigNumber
          const chainId: number = network.config.chainId!

          beforeEach(async function () {
              await deployments.fixture(["all"])

              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              player = accounts[0]
              raffle = await ethers.getContract("Raffle", player)
              interval = await raffle.getInterval()
              vrfCoordinatorV2 = await ethers.getContract("VRFCoordinatorV2Mock", player)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("constructor", function () {
              it("initialized the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()

                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"])
              })
          })

          describe("enter raffle", function () {
              it("reverts if you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughEthEnter")
              })

              it("records players when they enter", async function () {
                  const transactionResponse = await raffle.enterRaffle({ value: raffleEntranceFee })
                  const transactionReceipt = await transactionResponse.wait(1)
                  const playerFromContract = await raffle.getPlayer(0)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  gasCost = gasUsed.mul(effectiveGasPrice)
                  console.log("gasCost:", gasCost)
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
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // we are going to pretend to be a chainlink keeper
                  await raffle.performUpkeep([])
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle_NotOpen"
                  )
              })
          })

          describe("checkUpKeep", function () {
              it("returns false if people haven't sent any Eth", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if people haven't sent any Eth", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([])
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")

                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")

                  assert.equal(upkeepNeeded, false)
              })

              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")

                  assert.equal(upkeepNeeded, true)
              })
          })

          describe("performUpkeep", function () {
              it("can only run if checkUpkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep("0x")

                  assert.exists(tx)
              })

              it("reverts if checkup is false", async () => {
                  // evm events never happened
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  )
              })

              it("updates the raffle state and emits a requestId", async () => {
                  // Too many asserts in this test!
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const raffleState = await raffle.getRaffleState()
                  const requestId = txReceipt!.events![1].args!.requestId

                  assert.isTrue(requestId.toNumber() > 0)
                  assert.isTrue(raffleState == 1)
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })

              it("can only be called after performUpkeep", async () => {
                  await expect(
                      vrfCoordinatorV2.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances: number = 3
                  const startingIndex: number = 1
                  let winnerStartingBalance: BigNumber

                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimestamp()

                  // This will be more important for our staging tests...
                  await new Promise<void>(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.

                          try {
                              // Now lets get the ending values...
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[1].getBalance()
                              const endingTimeStamp = await raffle.getLatestTimestamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted

                              assert.equal(recentWinner.toString(), accounts[1].address)
                              assert.equal(raffleState.toString(), "0")

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrances)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                              assert.isTrue(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)

                      winnerStartingBalance = await accounts[1].getBalance()

                      await vrfCoordinatorV2.fulfillRandomWords(
                          txReceipt!.events![1].args!.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
