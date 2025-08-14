import assert from "node:assert";
import { exec } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { DefaultArtifactClient } from "@actions/artifact";
import { getInput, setFailed, summary } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { unstyle } from "ansi-colors";

const ARTIFACT_NAME = "bench-results";

async function execute(command: string): Promise<string> {
    return await new Promise((resolve, reject) => {
        exec(command, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

async function run() {
    const token = getInput("token");
    const octokit = getOctokit(token);

    const pullRequest = context.payload.pull_request;

    if (pullRequest) {
        console.log("Context is pull request");

        const compareAgainst = getInput("compare-against");

        try {
            console.log(`Retrieving workflow runs for ${context.workflow} on branch ${compareAgainst}`);

            // Example: "owner/repo/.github/workflows/ci.yml@refs/heads/main"
            const workflowRef = process.env.GITHUB_WORKFLOW_REF!;
            // "ci.yml"
            const workflowFile = workflowRef.split("/.github/workflows/")[1].split("@")[0];
            const workflowRuns = await octokit.rest.actions.listWorkflowRuns({
                owner: context.repo.owner,
                repo: context.repo.repo,
                branch: compareAgainst,
                // biome-ignore lint/style/useNamingConvention: API
                workflow_id: workflowFile,
                // biome-ignore lint/style/useNamingConvention: API
                per_page: 1,
                page: 1,
            });

            assert(workflowRuns.data.workflow_runs.length > 0, `No workflow run found for ${workflowFile} on branch ${compareAgainst}`);

            const workflowRun = workflowRuns.data.workflow_runs[0];

            console.log(`Retrieving artifacts from workflow run ${workflowRun.id} on branch ${compareAgainst}`);

            const artifacts = await octokit.rest.actions.listWorkflowRunArtifacts({
                owner: context.repo.owner,
                repo: context.repo.repo,
                // biome-ignore lint/style/useNamingConvention: API
                run_id: workflowRun.id,
            });
            const matchArtifact = artifacts.data.artifacts.find((artifact) => artifact.name === ARTIFACT_NAME);

            assert(matchArtifact, `No artifact found for ${workflowRun.url}`);

            console.log(`Downloading artifact ${matchArtifact.id} from workflow run ${workflowRun.id} on branch ${compareAgainst}`);

            const download = await octokit.rest.actions.downloadArtifact({
                owner: context.repo.owner,
                repo: context.repo.repo,
                // biome-ignore lint/style/useNamingConvention: API
                artifact_id: matchArtifact.id,
                // biome-ignore lint/style/useNamingConvention: API
                archive_format: "zip",
            });
            const artifactZipFileName = `${ARTIFACT_NAME}.zip`;

            writeFileSync(artifactZipFileName, Buffer.from(download.data as ArrayBuffer));

            const unzipOutput = await execute(`unzip ${artifactZipFileName}`);

            console.log(unzipOutput);

            const benchResultFile = getInput("base-result");

            assert(existsSync(benchResultFile), `Invalid artifact for ${workflowRun.html_url}`);

            console.log(`Running against ${workflowRun.head_branch}`);

            const benchCompareCmd = getInput("compare-cmd");
            const benchOutput = unstyle(await execute(benchCompareCmd));

            console.log(benchOutput);

            const commentStart = `Comparing \`${context.ref}\` with \`${workflowRun.head_branch}\``;
            const body = `${commentStart} (${workflowRun.head_sha}, ran: ${workflowRun.updated_at})
Merging this pull request will have the following performance impact:
\`\`\`
${benchOutput}
\`\`\`
`;

            console.log("Finding existing comment");

            const existingComments = await octokit.rest.issues.listComments({
                owner: context.repo.owner,
                repo: context.repo.repo,
                // biome-ignore lint/style/useNamingConvention: API
                issue_number: pullRequest.number,
            });
            const existingComment = existingComments.data.find((c) => c.body?.startsWith(commentStart));

            if (existingComment) {
                console.log(`Found existing comment ${existingComment.id}`);

                await octokit.rest.issues.updateComment({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    // biome-ignore lint/style/useNamingConvention: API
                    issue_number: pullRequest.number,
                    // biome-ignore lint/style/useNamingConvention: API
                    comment_id: existingComment.id,
                    body,
                });
            } else {
                await octokit.rest.issues.createComment({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    // biome-ignore lint/style/useNamingConvention: API
                    issue_number: pullRequest.number,
                    body,
                });
            }

            await summary.addHeading("CI Bench results").addCodeBlock(benchOutput).write();
        } catch (error) {
            setFailed((error as Error)?.message ?? "Unknown error");
        }
    } else {
        console.log("Context is base");

        try {
            console.log("Running base");

            // running base
            const benchBaseCmd = getInput("base-cmd");
            const benchOutput = unstyle(await execute(benchBaseCmd));

            console.log(benchOutput);

            const benchResultFile = getInput("base-result");
            const artifactClient = new DefaultArtifactClient();
            const { id, size } = await artifactClient.uploadArtifact(ARTIFACT_NAME, [benchResultFile], ".");

            console.log(`Uploaded artifact ${id} (${size} bytes)`);

            await summary.addHeading("CI Bench results").addCodeBlock(benchOutput).write();
        } catch (error) {
            setFailed((error as Error)?.message ?? "Unknown error");
        }
    }
}

run();
