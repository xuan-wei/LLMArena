import { prisma } from "@/lib/prisma";

/**
 * Cascade-delete one or more users.
 * SQLite doesn't auto-cascade all relations, so we manually clean up
 * every foreign key that references User before deleting the row.
 */
export async function cascadeDeleteUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  await prisma.$transaction(async (tx) => {
    // Collect this user's StudentLLMConfig IDs up front (needed for nullifying refs)
    const studentLLMIds = (
      await tx.studentLLMConfig.findMany({
        where: { userId: { in: ids } },
        select: { id: true },
      })
    ).map((c) => c.id);

    // 1. Nullify reviewer reference on publisher applications
    await tx.publisherApplication.updateMany({
      where: { reviewedBy: { in: ids } },
      data: { reviewedBy: null },
    });

    // 2. Delete submissions (Answer rows cascade via Submission.onDelete: Cascade)
    await tx.submission.deleteMany({ where: { userId: { in: ids } } });

    // 3. Delete enrollments
    await tx.enrollment.deleteMany({ where: { userId: { in: ids } } });

    // 4. Nullify judge profiles and tasks that reference the user's StudentLLMConfigs
    if (studentLLMIds.length > 0) {
      await tx.judgeProfile.updateMany({
        where: { studentLLMConfigId: { in: studentLLMIds } },
        data: { studentLLMConfigId: null },
      });
      await tx.task.updateMany({
        where: { adminStudentLLMConfigId: { in: studentLLMIds } },
        data: { adminStudentLLMConfigId: null },
      });
    }

    // 5. Delete the user's StudentLLMConfigs
    await tx.studentLLMConfig.deleteMany({ where: { userId: { in: ids } } });

    // 6. Disown tasks (keep them, just remove the creator link)
    await tx.task.updateMany({
      where: { createdBy: { in: ids } },
      data: { createdBy: null },
    });

    // 7. Disown judge profiles
    await tx.judgeProfile.updateMany({
      where: { createdBy: { in: ids } },
      data: { createdBy: null },
    });

    // 8. Disown system LLM configs
    await tx.lLMConfig.updateMany({
      where: { createdBy: { in: ids } },
      data: { createdBy: null },
    });

    // 9. Delete users — Notification, PublisherApplication (own), PasswordResetToken
    //    all have onDelete: Cascade and are handled automatically.
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
}
