# Contributing

Thanks for taking a look at this project. It's still pretty early stage so things might be a bit rough in places.

## Getting Started

1. Fork the repo
2. Clone your fork locally
3. Run `npm install` — might take a minute, there are a few heavy deps
4. Copy `.env.example` to `.env` and fill in your Hedera testnet credentials
5. Run `npm test` to make sure the baseline tests pass before making changes

## Making Changes

- Please open an issue first before submitting a big PR — I'd hate for you to put in a ton of work and have it not align with the direction I'm going
- For small fixes (typos, clarifications) just go ahead and open a PR directly
- Make sure `npm test` still passes after your changes
- Try to keep commits focused — one logical change per commit if you can

## Code Style

Not super strict about this but basically:
- 2 space indentation
- Single quotes for strings
- Async/await over raw promises where possible
- Add comments when the logic isn't obvious (I do this inconsistently myself, I know)

## Known Issues / What's Still WIP

- The grid emission factor is currently hardcoded — I want to pull this from a config or API eventually
- Error handling in the Hedera token minting could be more robust (it occasionally fails on testnet due to rate limits)
- Some test mocks are a bit hacky, want to clean these up

## Questions

Feel free to open an issue if something is unclear. I'll try to respond within a day or two.
