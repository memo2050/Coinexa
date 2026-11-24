import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import GoogleIcon from "@/components/GoogleIcon";
import { appParams } from "@/lib/app-params";

// Asks the auth server once whether Google sign-in is switched on, so the button
// only appears when it will work (it turns on by itself once Google is configured).
let googleEnabled;
async function isGoogleEnabled() {
  if (googleEnabled !== undefined) return googleEnabled;
  try {
    const res = await fetch(`${appParams.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: appParams.supabaseAnonKey },
    });
    const settings = await res.json();
    googleEnabled = settings?.external?.google === true;
  } catch {
    googleEnabled = false;
  }
  return googleEnabled;
}

export default function GoogleSignIn({ onClick }) {
  const [enabled, setEnabled] = useState(googleEnabled === true);

  useEffect(() => {
    let active = true;
    isGoogleEnabled().then((value) => active && setEnabled(value));
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-6" onClick={onClick}>
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>
    </>
  );
}
