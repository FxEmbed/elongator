
/* Tool to automatically change the country of the user to one outside
  the UK and EU in response to age verification regulations 
  
  You need to run this in Bun because it references the ClientTransaction class from the src folder */

import fs from "fs";
import delay from "delay";
import { ClientTransaction } from "../src/transaction/transaction";

const forbiddenCountries = [
  'at','be','bg','hr','cy','cz','dk','ee','fi','fr','de','gr','hu','ie',
  'it','lv','lt','lu','mt','nl','pl','pt','ro','sk','si','es','se',
  'is','li','no', 'gb'
]

const replacementCountries = [
  'ca', 'us'
]

const baseHeaders =  {
  accept: "*/*",
  "accept-language": "en",
  authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
  "sec-ch-ua": "\"Chromium\";v=\"138\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"138\"",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Windows\"",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "x-twitter-active-user": "yes",
  "x-twitter-auth-type": "OAuth2Session",
  "x-twitter-client-language": "en",
}

async function setCountry(account, transactionId, country) {
  const params = new URLSearchParams({
    country_code: country
  });
  const response = await fetch(
    "https://api.x.com/1.1/account/settings.json",
    {
      headers: {
        ...baseHeaders,
        "content-type": "application/x-www-form-urlencoded",
        cookie: `auth_token=${account.authToken}; ct0=${account.csrfToken}`,
        "x-csrf-token": account.csrfToken,
        "x-client-transaction-id": transactionId
      },
      referrer: "https://x.com/settings/your_twitter_data/account",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: params,
      method: "POST",
      mode: "cors",
      credentials: "include"
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}


async function getSettings(account, transactionId) {
  const response = await fetch(
    "https://api.x.com/1.1/account/settings.json",
    {
      headers: {
        ...baseHeaders,
        "content-type": "application/json",
        cookie: `auth_token=${account.authToken}; ct0=${account.csrfToken}`,
        "x-csrf-token": account.csrfToken,
        "x-client-transaction-id": transactionId
      },
      referrer: "https://x.com/settings/your_twitter_data/account",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: null,
      method: "GET",
      mode: "cors",
      credentials: "include"
    }
  );
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

async function main() {
  let clientTransaction;
  
  try {
    console.log('Initializing client transaction...');
    clientTransaction = await ClientTransaction.create();
    console.log('Client transaction initialized successfully');
  } catch (error) {
    console.error('Failed to initialize client transaction:', error);
    return;
  }

  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync("./credentials.json", "utf8"));
  } catch (error) {
    console.error('Failed to read credentials file:', error);
    return;
  }
  
  console.log('Accounts count: ' + credentials.accounts.length);

  for (let i = 0; i < credentials.accounts.length; i++) {
    const account = credentials.accounts[i];
    try {
      console.log(`Processing account ${i + 1}/${credentials.accounts.length}: ${account.username}`);
      
      const transactionId = await clientTransaction.generateTransactionId('GET', '/1.1/account/settings.json');
      const settings = await getSettings(account, transactionId);
      
      console.log('Account: ' + account.username + ' has country: ' + settings.country_code);

      if (forbiddenCountries.includes(settings.country_code)) {
        const newCountry = replacementCountries[Math.floor(Math.random() * replacementCountries.length)];
        console.log('Setting account: ' + account.username + ' to country: ' + newCountry);
        const transactionId = await clientTransaction.generateTransactionId('POST', '/1.1/account/settings.json');
        const response = await setCountry(account, transactionId, newCountry);
        console.log('Account: ' + account.username + ' has been set to country: ' + response.country_code);
      }
      
      // Add meaningful delay to respect rate limits
      
    } catch (error) {
      console.error(`Error processing account ${account.username}:`);
      console.error(error.message || error);
      
      // If we get rate limited, wait longer before continuing
      if (error.message && error.message.includes('429')) {
        console.log('Rate limited, waiting 60 seconds...');
        await delay(10000);
      } else {
        await delay(2000); // Wait 2 seconds after any error
      }
    }
  }
  
  console.log('Finished processing all accounts');
}

main().catch((error) => {
  console.error('Fatal error in main:', error);
});
