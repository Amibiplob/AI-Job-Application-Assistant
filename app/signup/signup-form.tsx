"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signup, type SignupState } from "./actions";

const initialState: SignupState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form action={formAction} className="mt-7 space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-[#303a33]">
          Name
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          maxLength={100}
          required
          defaultValue={state.values?.name}
          aria-invalid={Boolean(state.errors?.name)}
          aria-describedby={state.errors?.name ? "name-error" : undefined}
          className="h-11 rounded-lg border-[#dfe4dc] bg-white px-3"
        />
        {state.errors?.name && (
          <p id="name-error" className="text-sm text-red-700">
            {state.errors.name}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-[#303a33]">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
          required
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.errors?.email)}
          aria-describedby={state.errors?.email ? "email-error" : undefined}
          className="h-11 rounded-lg border-[#dfe4dc] bg-white px-3"
        />
        {state.errors?.email && (
          <p id="email-error" className="text-sm text-red-700">
            {state.errors.email}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-[#303a33]">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          required
          aria-invalid={Boolean(state.errors?.password)}
          aria-describedby={state.errors?.password ? "password-error" : "password-hint"}
          className="h-11 rounded-lg border-[#dfe4dc] bg-white px-3"
        />
        {state.errors?.password ? (
          <p id="password-error" className="text-sm text-red-700">
            {state.errors.password}
          </p>
        ) : (
          <p id="password-hint" className="text-xs text-[#7b827a]">
            Use at least 12 characters.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-[#303a33]">
          Confirm password
        </label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          required
          aria-invalid={Boolean(state.errors?.confirmPassword)}
          aria-describedby={state.errors?.confirmPassword ? "confirm-password-error" : undefined}
          className="h-11 rounded-lg border-[#dfe4dc] bg-white px-3"
        />
        {state.errors?.confirmPassword && (
          <p id="confirm-password-error" className="text-sm text-red-700">
            {state.errors.confirmPassword}
          </p>
        )}
      </div>

      {state.message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-lg bg-[#203c32] text-sm text-white hover:bg-[#2d5143]"
      >
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
