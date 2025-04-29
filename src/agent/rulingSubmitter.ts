import { ethers } from 'ethers';
import { withRetry } from '../utils/retry';
import { config } from '../config';

export async function submitRuling(
  provider: ethers.Provider,
  disputeID: number,
  ruling: number
) {
  const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
  const klerosAbi = ['function giveRuling(uint256,uint256)'];
  const contract = new ethers.Contract(config.KLEROS_COURT_ADDRESS, klerosAbi, wallet);

  await withRetry(async () => {
    const tx = await contract.giveRuling(disputeID, ruling);
    await tx.wait(1);
  });
}
