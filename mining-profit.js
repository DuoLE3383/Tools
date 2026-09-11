import axios from 'axios';
import cheerio from 'cheerio';

const YOUR_HASHRATE_GH = 100.0; // 👈 set your actual hashrate
const POOL_FEE = 0.009;
const URL = 'https://conflux.herominers.com/';

async function fetchAndCalculate() {
  try {
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    // Extract values using the updated page structure
    const networkHashText = $('div:contains("Network Hash Rate")').text();
    const diffText = $('div:contains("Difficulty")').text();
    const rewardText = $('div:contains("Last Reward")').text();
    const priceText = $('div:contains("USD")').first().text();

    const networkHash = parseFloat(networkHashText.match(/([\d.]+)/)?.[0]) || 0;
    const difficulty = parseFloat(diffText.match(/([\d.]+)/)?.[0]) || 0;
    const blockReward = parseFloat(rewardText.match(/([\d.]+)/)?.[0]) || 0;
    const priceUSD = parseFloat(priceText.match(/([\d.]+)/)?.[0]) || 0;

    if (!networkHash || !difficulty || !blockReward || !priceUSD) {
      console.error('Failed to parse data. Check selectors.');
      return;
    }

    // Convert to H/s and absolute difficulty
    const yourHash = YOUR_HASHRATE_GH * 1e9;
    const diffAbs = difficulty * 1e9;

    const cfxPerDay = (yourHash * 86400 * blockReward) / (diffAbs * Math.pow(2, 32));
    const cfxPerDayAfterFee = cfxPerDay * (1 - POOL_FEE);

    const usdPerDay = cfxPerDayAfterFee * priceUSD;

    console.log(`\n[${new Date().toLocaleString()}]`);
    console.log(`Network: ${networkHash} GH/s | Diff: ${difficulty} GH | Reward: ${blockReward} CFX | Price: $${priceUSD}`);
    console.log(`Your hashrate: ${YOUR_HASHRATE_GH} GH/s (after ${POOL_FEE*100}% fee)`);
    console.log(`Daily estimate: ${cfxPerDayAfterFee.toFixed(6)} CFX ≈ $${usdPerDay.toFixed(6)}`);
    console.log(`Weekly: ${(cfxPerDayAfterFee*7).toFixed(6)} CFX ≈ $${(usdPerDay*7).toFixed(6)}`);
    console.log(`Monthly: ${(cfxPerDayAfterFee*30.44).toFixed(6)} CFX ≈ $${(usdPerDay*30.44).toFixed(6)}`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

console.log('Mining profit monitor started (every 60s)');
fetchAndCalculate();
setInterval(fetchAndCalculate, 60000);