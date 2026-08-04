# Pull Request

## Summary

-

## Testing

- [ ] `npm test`
- [ ] `npm run test:dist`
- [ ] `npm run typecheck`

## PR Preview Package

When this PR is opened from this repository (not a fork), CI publishes an npm preview build
with tag `pr-<PR_NUMBER>`.

Install command:

```bash
npm install path-of-least-regret@pr-<PR_NUMBER>
```

Example for PR 123:

```bash
npm install path-of-least-regret@pr-123
```
