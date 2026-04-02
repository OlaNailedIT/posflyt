# Branch Protection Policy

Apply this policy to `main` before pilot expansion:

1. Require pull request before merge.
2. Require all status checks to pass:
   - `Backend Unit Tests`
   - `Backend Integration Tests`
   - `Frontend Build`
   - `Browser Smoke Tests`
3. Require branch to be up to date before merge.
4. Disable force pushes and branch deletion.
5. Require at least one reviewer approval.

This enforces: no merge without CI green and smoke green.
