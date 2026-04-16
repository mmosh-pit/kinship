import { NextRequest, NextResponse } from "next/server";
import { mergeBranch, deleteBranch } from "@/app/(main)/lib/githubClient";
import { verifyWizard } from "@/app/(main)/lib/verifyWizard";

const PREVIEW_BRANCH = "landing-page-preview";

export async function POST(request: NextRequest) {
    const auth = await verifyWizard(request);
    if (auth.error) return auth.error;

    try {
        const body = await request.json().catch(() => ({}));
        const { discard } = body;

        if (discard) {
            // Just clean up: delete the preview branch without merging
            try {
                await deleteBranch(PREVIEW_BRANCH);
            } catch (cleanupError) {
                console.warn("Failed to delete preview branch on discard:", cleanupError);
            }
            return NextResponse.json({
                success: true,
                discarded: true,
            });
        }

        // 1. Merge the preview branch into main
        const result = await mergeBranch(
            PREVIEW_BRANCH,
            "Merge AI-edited landing page into production",
        );

        // 2. Clean up: delete the preview branch
        try {
            await deleteBranch(PREVIEW_BRANCH);
        } catch (cleanupError) {
            // Non-fatal — branch cleanup can fail if already deleted
            console.warn("Failed to delete preview branch:", cleanupError);
        }

        return NextResponse.json({
            success: true,
            merged: result.merged,
            sha: result.sha,
        });
    } catch (error) {
        console.error("Landing page merge error:", error);
        return NextResponse.json(
            {
                error: "Failed to merge changes",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
