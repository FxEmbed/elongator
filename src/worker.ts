type Credentials = {
  authToken: string
  csrfToken: string
  username: string
}

type CredentialList = {
  accounts: Credentials[]
}

import _credentials from '../credentials.json';
import { ClientTransaction } from './transaction/transaction'
const credentials: CredentialList = _credentials;
const redactUsername = false;

async function handleRequest(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
  // Extract the URL of the Twitter API endpoint from the incoming request
  const url = new URL(request.url)
  const apiUrl = `https://api.x.com${url.pathname}${url.search}`
  const requestPath = new URL(url).pathname.split('?')[0];

  // Check if the API endpoint is on the allowlist
  if (!isAllowlisted(apiUrl)) {
    return new Response('Endpoint not allowlisted', { status: 403 })
  }

  // Clone the incoming request and modify its headers
  const headers = new Headers(request.headers)

  headers.delete('x-guest-token')

  let existingCookies = request.headers.get('Cookie');

  // Create a new request with the modified properties
  const newRequestInit: RequestInit = {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: request.redirect,
    integrity: request.integrity,
    signal: request.signal
  }

  // Send the modified request to the Twitter API

  // Read the response body to create a new response with string version of body
  // Decode the response using the TextDecoder API
  const textDecoder = new TextDecoder('utf-8')

  // Send the modified request to the Twitter API
  let response: Response;
  let json: any;
  let errors: boolean;
  let decodedBody: string;
  let attempts = 0;

  do {
    errors = false;
    const { authToken, csrfToken, username } = getRandomAccount();
    let newCookies = `auth_token=${authToken}`;
    /* If GraphQL request, we need to replace x-csrf-token and the ct0 cookie with saved csrfToken
       Unlike REST requests, GraphQL requests require a server csrf token. This restriction does not apply to guest token access. */
    if (apiUrl.includes('graphql')) {
      existingCookies = existingCookies?.replace(/ct0=(.+?);/, '') || '';
      newCookies = `auth_token=${authToken}; ct0=${csrfToken}; `;
      headers.set('x-csrf-token', csrfToken);
    }
    const cookies = mergeCookies(existingCookies?.toString(), newCookies);

    headers.set('Cookie', cookies);
    headers.delete('Accept-Encoding');

    if (needsTransactionId(apiUrl)) {
      try {
        const transaction = await ClientTransaction.create(attempts > 1)
        .catch(err => {
          throw err;
        });
        const transactionId = await transaction.generateTransactionId('GET', requestPath);
        console.log('Generated transaction ID:', transactionId);
        headers.set('x-client-transaction-id', transactionId);
      } catch (e) {
        console.log('Error generating transaction ID:', e);
      }
    }

    newRequestInit.headers = headers;

    const newRequest = new Request(apiUrl, newRequestInit);
    const startTime = performance.now();
    response = await fetch(newRequest);
    const endTime = performance.now();
    console.log(`Fetch completed in ${endTime - startTime}ms`);

    response.headers.forEach((value, key) => {
      // console.log(`${key}: ${value}`);
    });

    const rawBody = textDecoder.decode(await response.arrayBuffer());
    // Read the response body to create a new response with string version of body
    decodedBody = rawBody.match(/{.+}/)?.[0] || '{}';

    // console.log('response', rawBody);

    const statusId = request.url.match(/(?<=focalTweetId%22%3A%22)\d+(?=%)|(?<=tweetId=)\d+(?=,)/g)?.[0] ?? request.url;

    // Print out x-rate-limit-remaining
    const rateLimitRemaining = response.headers.get('x-rate-limit-remaining') ?? 'N/A';
    console.log(`Rate limit remaining for account: ${rateLimitRemaining}`)
    // Print rate limit reset converted to a human readable date
    const rateLimitReset = response.headers.get('x-rate-limit-reset') ?? '0';
    const rateLimitResetDate = new Date(Number(rateLimitReset) * 1000)
    console.log(`Rate limit reset for account: ${rateLimitResetDate}`)

    try {
      attempts++;
      console.log('---------------------------------------------')
      console.log(`Attempt #${attempts} with account ${redactUsername ? '[REDACTED]' : username}`);
      if (statusId.length < 20) {
        console.log(`Fetching status ID: ${statusId}`);
      }
      json = JSON.parse(decodedBody);
      if (json.errors || decodedBody.includes(`"reason":"NsfwViewerIsUnderage"`)) {
        console.log(json.errors);
        errors = true;

        if (decodedBody.includes(`"reason":"NsfwViewerIsUnderage"`)) {
          console.log('NsfwViewerIsUnderage: Account country may be set to UK or EU');
          errors = true;
          json.errors = [{
            message: 'Account country set to UK or EU and tried to access NSFW content',
            code: 403
          }]
        } else if (response.status === 404) {
          console.log('Status not found');
          errors = false;
          return new Response('Status not found', { status: 404 })
          // Timeout: Unspecified
        } else if (json?.errors?.[0]?.message?.includes('No status found with that ID')) {
          console.log('Status not found');
          errors = false;
          return new Response('Status not found', { status: 404 })
        } else if (json?.errors?.[0]?.code === 366) {
          console.log('Status not found');
          errors = false;
          return new Response('Status not found', { status: 404 })
          // Timeout: Unspecified
        } else if (json?.errors?.[0]?.code === 144) {
          console.log('Status not found');
          errors = false;
          return new Response('Status not found', { status: 404 })
          // Timeout: Unspecified
        } else if (json?.errors?.[0]?.code === 29) {
          console.log('Downstream fetch problem (Timeout: Unspecified). Ignore this as this is usually not an issue.');
          errors = false;
        } else if (json?.errors?.[0]?.code === 88) {
          console.log('Downstream fetch problem (Rate limit exceeded). Ignore this as this is usually not an issue.');
          errors = false;
        } else if (json?.errors?.[0]?.name === 'DependencyError') {
          console.log('Downstream fetch problem (DependencyError). Ignore this as this is usually not an issue.');
          errors = false;
        } else if (json?.errors?.[0]?.message === 'ServiceUnavailable: Unspecified') {
          console.log('Downstream fetch problem (ServiceUnavailable), use fallback methods');
          errors = true;
          return new Response('Downstream fetch problem (ServiceUnavailable), use fallback methods', { status: 502 })
        } else if (json?.errors?.[0]?.name === 'DownstreamOverCapacityError') {
          console.log('Downstream fetch problem (DownstreamOverCapacityError), use fallback methods');
          errors = true;
          return new Response('Downstream fetch problem (DownstreamOverCapacityError), use fallback methods', { status: 502 })
        } else if (json?.errors?.[0]?.message === 'Internal: Unspecified') {
          console.log('Downstream fetch problem (Internal: Unspecified). Ignore this as this is usually not an issue.');
          errors = false;
        } else if (json?.errors?.[0]?.message.includes('Denied by access control: Missing LdapGroup')) {
          console.log('Downstream fetch problem (Authorization: Denied by access control: Missing LdapGroup). Ignore this as this is usually not an issue.');
          errors = false;
        } else if (json?.errors?.[0]?.message.includes('Query: Unspecified')) {
          console.log('Downstream fetch problem (Query: Unspecified). Ignore this as this is usually not an issue.');
          errors = false;
        }
      }
      if (env.EXCEPTION_DISCORD_WEBHOOK && errors) {
        console.log('Sending Discord webhook');
        const body: any = JSON.stringify({
          content: `@everyone`,
          embeds: [{
            title: "Elongator Account Error",
            description: "If this account is locked, please unlock it ASAP",
            color: 0xFF0000, // Red color
            fields: [
              {
                name: "Account",
                value: username,
                inline: true
              },
              {
                name: "Errors",
                value: "```json\n" + JSON.stringify(json.errors, null, 2) + "\n```",
                inline: false
              },
              {
                name: 'Endpoint',
                value: (requestPath ?? '').match(/\w+$/g)?.[0] ?? 'idk',
                inline: true
              },
              {
                name: "Status",
                value: statusId.length > 20 ? '[REDACTED]' : statusId,
                inline: true
              }
            ]
          }]
        })
        console.log('body', body);
        const discordResponse = await fetch(env.EXCEPTION_DISCORD_WEBHOOK, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: body
        }).catch(err => console.error('Failed to send Discord webhook:', err));
        console.log('discordResponse', await discordResponse?.text());
      }

      if (typeof json.data === 'undefined' && typeof json.translation === 'undefined') {
        console.log(`No data was sent. Response code ${response.status}. Data sent`, rawBody ?? '[empty]');
        Object.keys(headers).forEach((key) => {
          // console.log(key, headers.get(key));
        });

        errors = true;
      }
    } catch (e) {
      console.log('Error parsing JSON:', e);
      errors = true;
    }
    if (errors) {
      console.log(`Account is not working, trying another one...`);
    }
    
    // if attempts over 5, return bad gateway
    if (attempts > 4) {
      console.log('Maximum failed attempts reached');
      return new Response('Maximum failed attempts reached', { status: 502 })
    }
  } while (errors);
 

  // Create a new Response object with the decoded body
  const decodedResponse = new Response(decodedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })

  console.log(`Got our response with code ${response.status}, we're done here!`)

  return decodedResponse
}

function isAllowlisted(apiUrl: string): boolean {
  const url = new URL(apiUrl)
  const allowlistPath: string[] = [
    '/i/api/1.1/strato/column/None/tweetId',
    '/1.1/live_video_stream/status/',
    '/2/grok/translation.json',
  ]
  const allowlistQuery: string[] = [
    'TweetResultByRestId',
    'TweetResultsByRestIds',
    'TweetResultByIdQuery',
    'TweetResultsByIdsQuery',
    'TweetDetail',
    'UserByScreenName',
    'UserResultByScreenNameQuery',
    'UserResultByScreenName',
  ]

  if (apiUrl.includes('graphql')) {
    const query = url.pathname.split('/').pop()
    return allowlistQuery.some(endpoint => endpoint === query)
  }

  const endpointPath = new URL(apiUrl).pathname

  console.log('endpointPath',endpointPath)
  return allowlistPath.some(endpoint => endpointPath.startsWith(endpoint))
}

function needsTransactionId(apiUrl: string): boolean {
  const url = new URL(apiUrl)
  const queries: string[] = [
    'TweetDetail'
  ]

  if (apiUrl.includes('graphql')) {
    const query = url.pathname.split('/').pop()
    return queries.some(endpoint => endpoint === query)
  }

  return false
}


function getRandomAccount(): Credentials {
  const randomIndex = Math.floor(Math.random() * credentials.accounts.length)
  const randomAccount = credentials.accounts[randomIndex]
  // console.log(`Using account ${randomAccount.username}`);
  return randomAccount
}

function mergeCookies(existingCookies?: string, newCookie?: string): string {
  if (!existingCookies) {
    return newCookie ?? ''
  }

  if (!newCookie) {
    return existingCookies
  }

  const existingCookieMap = parseCookies(existingCookies)
  const newCookieMap = parseCookies(newCookie)

  const mergedCookieMap = { ...existingCookieMap, ...newCookieMap }
  const mergedCookieList = Object.entries(mergedCookieMap).map(([name, value]) => `${name}=${value}`)
  const mergedCookies = mergedCookieList.join('; ')

  return mergedCookies
}

function parseCookies(cookieHeader: string, isGraphQL = false): Record<string, string> {
  const cookieList = cookieHeader.split(';')
  const cookieMap = cookieList.reduce((map, cookie) => {
    const [name, value] = cookie.trim().split('=')
    if (name) {
      map[name] = value
    }
    return map
  }, {} as Record<string, string>)

  return cookieMap
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};