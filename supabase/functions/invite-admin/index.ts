import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: corsHeaders,
  });
}

function respondJson(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return respond(405, "Method not allowed.");

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!projectUrl || !anonKey || !serviceRoleKey || !authorization) {
    return respond(500, "Admin account management is not configured.");
  }

  try {
    const callerClient = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const {
      data: { user: caller },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !caller) return respond(401, "Please sign in again.");

    const adminClient = createClient(projectUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerRole, error: roleError } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (roleError) {
      console.error("Could not verify admin role:", roleError.message);
      return respond(500, "Could not verify your admin permissions.");
    }
    if (!callerRole || !["admin", "super_admin"].includes(callerRole.role)) {
      return respond(403, "Only an admin can manage admin accounts.");
    }

    const body = await request.json();
    if (body.action === "list") {
      const { data: roleRows, error: listError } = await adminClient
        .from("admin_roles")
        .select("user_id, role, created_at")
        .order("created_at");
      if (listError) {
        console.error("Could not list admin roles:", listError.message);
        return respond(500, "Could not load admin accounts.");
      }

      const admins = await Promise.all(
        roleRows.map(async (role) => {
          const { data, error: userError } =
            await adminClient.auth.admin.getUserById(role.user_id);
          if (userError) {
            console.error(
              "Could not load an admin Auth user:",
              userError.message,
            );
            return { ...role, email: null };
          }
          return { ...role, email: data.user?.email ?? null };
        }),
      );
      return respondJson(200, { admins });
    }

    if (body.action === "remove") {
      if (callerRole.role !== "super_admin") {
        return respond(403, "Only a super admin can remove admin access.");
      }
      const userId =
        typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!userId) return respond(400, "Choose an admin account to remove.");
      if (userId === caller.id) {
        return respond(400, "You cannot remove your own admin access.");
      }

      const { data: targetRole, error: targetError } = await adminClient
        .from("admin_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (targetError) {
        console.error("Could not load target admin:", targetError.message);
        return respond(500, "Could not load the selected admin.");
      }
      if (!targetRole) return respond(404, "That admin account was not found.");
      if (targetRole.role === "super_admin") {
        return respond(400, "Super admin access cannot be removed here.");
      }

      const { error: deleteError } = await adminClient
        .from("admin_roles")
        .delete()
        .eq("user_id", userId);
      if (deleteError) {
        console.error("Could not remove admin role:", deleteError.message);
        return respond(500, "Could not remove this admin.");
      }
      return respond(200, "Admin access removed.");
    }

    if (body.action !== "create") {
      return respond(400, "Choose create or remove.");
    }
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, "Enter a valid email address.");
    }
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 12 || password.length > 128) {
      return respond(400, "Use an initial password between 12 and 128 characters.");
    }

    const {
      data: { user: targetUser },
      error: createError,
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) {
      console.error("Could not create Auth user:", createError.message);
      return respond(
        409,
        "Could not create this account. Confirm the email is unused and the password meets the project requirements.",
      );
    }
    if (!targetUser)
      return respond(500, "Supabase did not return the created user.");

    const { error: insertError } = await adminClient
      .from("admin_roles")
      .insert({
        user_id: targetUser.id,
        role: "admin",
        created_by: caller.id,
      });
    if (insertError) {
      console.error("Could not assign admin role:", insertError.message);
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(
        targetUser.id,
      );
      if (cleanupError) {
        console.error(
          "Could not remove Auth account after admin role assignment failed:",
          cleanupError.message,
        );
        return respond(
          500,
          "The account was created, but admin access could not be assigned or rolled back. Contact a super admin.",
        );
      }
      return respond(
        500,
        "Could not assign admin access. The newly created account was removed.",
      );
    }
    return respond(
      200,
      `Admin account created for ${email}. Share the initial password securely.`,
    );
  } catch (error) {
    console.error(
      "Admin management request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return respond(400, "The admin management request could not be completed.");
  }
});
