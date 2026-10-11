import { LogOut } from "lucide-react";
import { logout } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function LogoutControl() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" className="h-11 w-full justify-start gap-3 px-3 text-text-secondary">
        <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />Log out
      </Button>
    </form>
  );
}
