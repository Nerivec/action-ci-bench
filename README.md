# Github Action: CI Bench

Continuous benchmarking using Github actions (artifact-based)

# Description

> [!IMPORTANT]
> This is of course dependent on the runner used by the Github workflow. Changes in the Github infrastructure and plenty of other factors may affect the results. Use wisely, and provide a way to re-run the benchmarks in case of abberant results.

> [!TIP]
> Don't forget to configure your benchmarks for "ideal" results (warmup, iterations, etc.). e.g. [Vitest](https://vitest.dev/api/#bench)

Example workflow trigger:

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

### Baseline branch

Run a benchmark command (using [a spawned shell](https://nodejs.org/api/child_process.html#child_processexeccommand-options-callback)) and upload the results to the workflow artifacts (uses [@actions/artifact](https://github.com/actions/toolkit/tree/main/packages/artifact) internally).

### Pull request

Run a "comparing" benchmark command, using the retrieved results from the latest run on the baseline branch. The compared output is written as a comment in the pull request (or updated if previous comment detected).

> [!TIP]
> Configure the artifacts retention according to your project's needs (how often the baseline branch gets updated), else re-run a benchmark on the baseline branch to create a new artifact if the last run expired.

> [!TIP]
> ANSI colors are stripped from the output so it can be legible as a pull request comment.

# Usage

Originally intended for use with Vitest, but any compliant alternative should work, assuming:
- there is a way to write the results into a file (e.g. `--outputJson` with Vitest)
- there is a way to compare against previously written results (e.g. `--compare` with Vitest)

```yaml
- uses: nerivec/action-ci-bench@main
  with:
    # [required] The GitHub token for authentication
    token: ${{ secrets.GITHUB_TOKEN }}
    # [required] Name of the branch to compare against
    compare-against: main
    # [required] Command that runs the baseline benchmark
    base-cmd: npx vitest bench --run --config ./tests/vitest.config.mts --outputJson bench.json
    # [required] Command that runs the compare benchmark
    compare-cmd: npx vitest bench --run --config ./tests/vitest.config.mts --compare bench.json
    # [required] Name of the file the base benchmark results will be in (should match that of `*-cmd`)
    base-result: bench.json
```

### Job Permissions

```yaml
permissions:
  contents: write
  actions: read
  pull-requests: write
```
