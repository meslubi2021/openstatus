import { generateSlug } from "random-word-slugs";
import * as z from "zod";

import { analytics, trackAnalytics } from "@openstatus/analytics";
import { eq } from "@openstatus/db";
import { user, usersToWorkspaces, workspace } from "@openstatus/db/src/schema";
import { sendEmail, WelcomeEmail } from "@openstatus/emails";

import { createTRPCRouter, publicProcedure } from "../../trpc";
import { clerkEvent } from "./type";

export const webhookProcedure = publicProcedure.input(
  z.object({
    data: clerkEvent,
  }),
);

export const webhookRouter = createTRPCRouter({
  userCreated: webhookProcedure.mutation(async (opts) => {
    if (opts.input.data.type === "user.created") {
      // There's no primary key with drizzle I checked the tennant is not already in the database
      const alreadyExists = await opts.ctx.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.tenantId, opts.input.data.data.id))
        .get();
      if (alreadyExists) return;
      const userResult = await opts.ctx.db
        .insert(user)
        .values({
          email: opts.input.data.data.email_addresses[0].email_address,
          tenantId: opts.input.data.data.id,
          firstName: opts.input.data.data.first_name,
          lastName: opts.input.data.data.last_name || "",
        })
        .returning()
        .get();

      // guarantee the slug is unique accross our workspace entries
      let slug: string | undefined = undefined;

      while (!slug) {
        slug = generateSlug(2);
        const slugAlreadyExists = await opts.ctx.db
          .select()
          .from(workspace)
          .where(eq(workspace.slug, slug))
          .get();
        if (slugAlreadyExists) {
          console.log(`slug already exists: '${slug}'`);
          slug = undefined;
        }
      }

      const workspaceResult = await opts.ctx.db
        .insert(workspace)
        .values({ slug, name: "" })
        .returning({ id: workspace.id })
        .get();
      await opts.ctx.db
        .insert(usersToWorkspaces)
        .values({
          userId: userResult.id,
          workspaceId: workspaceResult.id,
        })
        .returning()
        .get();

      await sendEmail({
        from: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        subject: "Welcome to OpenStatus.dev 👋",
        to: [opts.input.data.data.email_addresses[0].email_address],
        react: WelcomeEmail(),
      });

      await analytics.identify(String(userResult.id), {
        email: opts.input.data.data.email_addresses[0].email_address,
        userId: userResult.id,
      });
      await trackAnalytics({
        event: "User Created",
        userId: String(userResult.id),
        email: opts.input.data.data.email_addresses[0].email_address,
      });
    }
  }),
  userUpdated: webhookProcedure.mutation(async (opts) => {
    if (opts.input.data.type === "user.updated") {
      // We should do something
    }
  }),
  userSignedIn: webhookProcedure.mutation(async (opts) => {
    if (opts.input.data.type === "session.created") {
      const currentUser = await opts.ctx.db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.tenantId, opts.input.data.data.user_id))
        .get();
      // Then it's the new user it might be null
      if (!currentUser) return;

      await analytics.identify(String(currentUser.id), {
        userId: currentUser.id,
        email: currentUser.email,
      });
      await trackAnalytics({ event: "User Signed In" });
    }
  }),
});

export const clerkRouter = createTRPCRouter({
  webhooks: webhookRouter,
});
