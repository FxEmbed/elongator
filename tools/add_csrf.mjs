/* Applet to automatically generate valid GraphQL csrf tokens for a set of accounts with auth_tokens.
   This lets you quickly add accounts. */

import fs from "fs";
import delay from "delay";

async function getCsrfToken(account) {
  const response = await fetch(
    "https://x.com/i/api/graphql/q94uRCEn65LZThakYcPT6g/TweetDetail?variables=%7B%22focalTweetId%22%3A%2220%22%2C%22with_rux_injections%22%3Afalse%2C%22includePromotedContent%22%3Atrue%2C%22withCommunity%22%3Atrue%2C%22withQuickPromoteEligibilityTweetFields%22%3Atrue%2C%22withBirdwatchNotes%22%3Atrue%2C%22withVoice%22%3Atrue%2C%22withV2Timeline%22%3Atrue%7D&features=%7B%22rweb_lists_timeline_redesign_enabled%22%3Atrue%2C%22responsive_web_graphql_exclude_directive_enabled%22%3Atrue%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22tweetypie_unmention_optimization_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Afalse%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_media_download_video_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D&fieldToggles=%7B%22withArticleRichContentState%22%3Afalse%7D",
    {
      headers: {
        accept: "*/*",
        "accept-language": "en",
        authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        "content-type": "application/json",
        "sec-ch-ua": "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"116\"",
        cookie: `auth_token=${account.authToken}`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": "",
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": "en"
      },
      referrer: "https://x.com/jack/status/20",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: null,
      method: "GET",
      mode: "cors",
      credentials: "include"
    }
  );

  const setCookie = response.headers.get("set-cookie");
  const csrfToken = setCookie?.match(/ct0=(.*?);/)?.[1] ?? '';
  return csrfToken;
}

async function main() {
  const credentials = JSON.parse(fs.readFileSync("./credentials.json"));
  const updatedAccounts = [];

  for (const account of credentials.accounts) {
    const csrfToken = await getCsrfToken(account);
    account.csrfToken = csrfToken;
    updatedAccounts.push(account);
    await delay(50); // 50ms delay
    console.log('Activated account: ' + account.username + ' with csrfToken: ' + csrfToken + '');
  }

  fs.writeFileSync(
    "./updatedCredentials.json",
    JSON.stringify({ accounts: updatedAccounts }, null, 2)
  );
}

main().catch((error) => console.error(error));
