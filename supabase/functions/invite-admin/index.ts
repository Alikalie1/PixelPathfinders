import {
  createClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2";

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
    return respond(500, "Admin invitation is not configured.");
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
    if (callerRole?.role !== "super_admin") {
      return respond(403, "Only a super admin can manage admin accounts.");
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
      const userId =
        typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!userId) return respond(400, "Choose an admin account to remove.");
      if (userId === caller.id) {
        return respond(400, "You cannot remove your own super admin access.");
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

    if (body.action !== "invite") {
      return respond(400, "Choose invite or remove.");
    }
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, "Enter a valid email address.");
    }

    let targetUser: User | null = null;
    for (let page = 1; page <= 50; page += 1) {
      const { data, error: usersError } =
        await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (usersError) {
        console.error("Could not search Auth users:", usersError.message);
        return respond(500, "Could not look up the Auth account.");
      }
      targetUser =
        data.users.find((user) => user.email?.toLowerCase() === email) || null;
      if (targetUser || data.users.length < 1000) break;
    }

    if (!targetUser) {
      const { data, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(email);
      if (inviteError) {
        console.error("Could not invite Auth user:", inviteError.message);
        return respond(400, "Supabase could not send the invitation.");
      }
      targetUser = data.user;
    }
    if (!targetUser)
      return respond(500, "Supabase did not return the invited user.");

    const { data: existingRole, error: existingRoleError } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", targetUser.id)
      .maybeSingle();
    if (existingRoleError) {
      console.error(
        "Could not check existing admin:",
        existingRoleError.message,
      );
      return respond(500, "Could not check the account's current role.");
    }
    if (existingRole?.role === "super_admin") {
      return respond(400, "That account is already a super admin.");
    }
    if (existingRole?.role === "admin") {
      return respond(409, "That account is already an admin.");
    }

    const { error: insertError } = await adminClient
      .from("admin_roles")
      .insert({
        user_id: targetUser.id,
        role: "admin",
        created_by: caller.id,
      });
    if (insertError) {
      console.error("Could not assign admin role:", insertError.message);
      return respond(
        500,
        "The Auth account exists, but admin access was not assigned.",
      );
    }
    return respond(
      200,
      targetUser.email === email
        ? `Admin access granted to ${email}.`
        : "Admin invitation sent.",
    );
  } catch (error) {
    console.error(
      "Admin management request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return respond(400, "The admin management request could not be completed.");
  }
});
