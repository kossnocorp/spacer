# Jev in the local playground

From the repository root, start the playground with:

```sh
mise run //pkgs/playground:dev
```

This task runs `fnox exec -- pnpm dev`. Select **Jev · API** in the model
selector. It works with all 17 example languages and with custom code supported
by our Tree-sitter grammars. Only blank lines are changed; source wrapping,
indentation, punctuation, and literal contents are preserved.

Supply a TypeSafe API key in either place:

- **Jev API key** in the playground. This overrides the server key for that
  request. The field is a password input held in React state, with no localStorage,
  cookie, URL, or on-disk persistence. Refreshing the page clears it. It is sent
  in the format request body to the playground server, which calls TypeSafe.
- **`TYPESAFE_API_KEY`** in the server environment (including fnox). Leave the
  browser field empty to use it. Restart the dev server after changing its
  environment. An environment key is never sent to the browser.

The request uses `jev-latest`. The resolved version from the API is shown with
the output timing. This is the hosted Jev service, not local Jev weights.
Calls consume the provider account's credits; the existing SDK batches boundary
questions and validates every returned probability before rendering.

The SDK also honors server-side `TYPESAFE_BASE_URL`. For a TypeSafe account,
leave it unset. To use an OpenRouter key instead, set it to
`https://openrouter.ai/api` before starting the server; the SDK appends
`/v1/systemone`. Use a key for the configured provider in the browser field or
in `TYPESAFE_API_KEY`. No arbitrary provider URL is accepted from browser input.
