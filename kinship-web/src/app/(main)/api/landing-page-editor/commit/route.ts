import { NextRequest, NextResponse } from "next/server";
import {
    createOrUpdateBranch,
    getFileContent,
    commitFile,
} from "@/app/(main)/lib/githubClient";
import { verifyWizard } from "@/app/(main)/lib/verifyWizard";

const LANDING_PAGE_PATH = "src/app/(main)/page.tsx";
const PREVIEW_BRANCH = "landing-page-preview";

export async function POST(request: NextRequest) {
    const auth = await verifyWizard(request);
    if (auth.error) return auth.error;

    try {
        const { content, message } = await request.json();

        if (!content || typeof content !== "string") {
            return NextResponse.json(
                { error: "content is required" },
                { status: 400 },
            );
        }

        const commitMessage =
            message || "AI-edited landing page via wizard editor";

        // 1. Create or reset the preview branch from main's HEAD
        await createOrUpdateBranch(PREVIEW_BRANCH);

        // 2. Get the file on the preview branch to obtain its SHA
        const file = await getFileContent(LANDING_PAGE_PATH, PREVIEW_BRANCH);

        // 3. Commit the modified content
        const result = await commitFile(
            PREVIEW_BRANCH,
            LANDING_PAGE_PATH,
            content,
            file.sha,
            commitMessage,
        );

        // 4. Build the Vercel preview URL
        // Convention: <project>-git-<branch>-<team>.vercel.app
        // Since we don't know the exact Vercel project/team slug at build time,
        // we provide the GitHub branch URL and let the frontend
        // also display the Vercel deployment URL once it's available.
        const githubBranchUrl = `https://github.com/${process.env.GITHUB_REPO_OWNER || "mmosh-pit"}/${process.env.GITHUB_REPO_NAME || "mmosh-app"}/tree/${PREVIEW_BRANCH}`;

        return NextResponse.json({
            branch: PREVIEW_BRANCH,
            commitSha: result.commitSha,
            githubUrl: githubBranchUrl,
            htmlUrl: result.htmlUrl,
        });
    } catch (error) {
        console.error("Landing page commit error:", error);
        return NextResponse.json(
            {
                error: "Failed to commit changes",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
