import { NextRequest, NextResponse } from "next/server";
import { branchExists, getFileContent } from "@/app/(main)/lib/githubClient";
import { verifyWizard } from "@/app/(main)/lib/verifyWizard";

const PREVIEW_BRANCH = "landing-page-preview";
const LANDING_PAGE_PATH = "src/app/(main)/page.tsx";

export async function GET(request: NextRequest) {
    const auth = await verifyWizard(request);
    if (auth.error) return auth.error;

    try {
        const exists = await branchExists(PREVIEW_BRANCH);

        if (!exists) {
            return NextResponse.json({
                hasPendingPreview: false,
            });
        }

        // Get the file from the preview branch to show what was changed
        let previewContent: string | null = null;
        try {
            const file = await getFileContent(LANDING_PAGE_PATH, PREVIEW_BRANCH);
            previewContent = file.content;
        } catch {
            // Branch exists but file read failed — unusual but not fatal
        }

        const githubBranchUrl = `https://github.com/${process.env.GITHUB_REPO_OWNER || "mmosh-pit"}/${process.env.GITHUB_REPO_NAME || "mmosh-app"}/tree/${PREVIEW_BRANCH}`;

        return NextResponse.json({
            hasPendingPreview: true,
            branch: PREVIEW_BRANCH,
            githubUrl: githubBranchUrl,
            previewContent,
        });
    } catch (error) {
        console.error("Landing page status error:", error);
        return NextResponse.json(
            {
                error: "Failed to check status",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
