# Deprecated: Account proxying is now built into the main [FxEmbed](https://github.com/FxEmbed/FxEmbed) worker

# FxTwitter Elongator

Elongator is an internal proxying service used to circumvent X/Twitter's heavy restrictions disallowing access to bulk Tweets from the guest API. FxTwitter relies on the guest API to provide unauthenticated access to Tweets, so in instances where Twitter excludes Tweets from the guest API, FxTwitter will be able to access them through elongator.

Elongator works by stamping the incoming request with an auth_token and csrf token from a real Twitter account, and requests are spread out among many accounts for more even rate-limit wearing. For GraphQL requests (All requests for FxTwitter these days), we also include valid per-account csrf tokens which is required for GraphQL functionality.

You can pull the auth_token and csrf token from the headers of outgoing requests from your proxy account (i.e. Looking through Cookies or Network tab in your browser's dev tools, auth token is `auth_token` and csrf is `ct0`)

This method of implementation helps reduce a single point of failure, as Twitter cannot easily shut down elongator at-will without otherwise breaking the compatibiltiy of their API for existing clients, so we have a buffer to fix changes they may make as they arise.

**Warning**: It is possible that Twitter can lock or suspend individual accounts. Usually, Twitter will lock accounts for automated activity up to 2 times and generally not ask again afterwards as long as you don't post tweets, etc. Others won't get locked, and others could be suspended.

`credentials.json` is what the script pulls your accounts from. You can also create a `credentials.complete.json` file to let you store all your accounts including passwords if desired. You can run `npm run strip` to strip out everything except what is necessary and put it into `credentials.json`: Username, csrf token, and auth token. If you have only auth tokens and you need csrf tokens, `add_csrf.mjs` can help you with this.

## Setup

### Requirements

* Latest LTS Node.js, and NPM
* Basic understanding of Cloudflare Workers and Service Bindings
* A _lot_ of Twitter accounts

### Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Set up credentials in `credentials.json`
4. Configure `wrangler.toml` with your Cloudflare account ID
5. `npm run reload` to upload the worker to Cloudflare and open a log
6. Make sure FxTwitter is set up with your elongator service binding in its `wrangler.toml`
