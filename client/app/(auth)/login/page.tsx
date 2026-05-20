"use client";

import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { loginService } from "@/api/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/store/hooks";
import { setSession } from "@/store/slices/authSlice";
import { setAccessibleCompanies, setSelectedCompanyId } from "@/store/slices/companySlice";
import { setPermissions } from "@/store/slices/permissionSlice";

type FormValues = {
  email: string;
  password: string;
};

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};

const welcomeWords = [
  "WELCOME",
  "TO",
  "THE",
  "LUMEX",
  "INVENTORY",
  "MANAGEMENT",
  "SYSTEM",
];

const getErrorMessage = (error: unknown) => {
  const apiError = error as ApiError;
  return apiError?.response?.data?.message || apiError?.message || "Login failed. Please try again.";
};

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      setIsSubmitting(true);

      const response = await loginService({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });

      const payload = response.data;

      dispatch(
        setSession({
          accessToken: payload.accessToken,
          refreshToken: "",
          user: payload.user,
        }),
      );

      dispatch(setAccessibleCompanies(payload.accessibleCompanies || []));
      dispatch(setSelectedCompanyId(payload.user.selectedCompanyId || null));
      dispatch(setPermissions(payload.user.permissions || {}));

      toast.success(`Welcome back, ${payload.user.fullName}!`);

      if (payload.user.role === "ORG_ADMIN") {
        router.push("/admin");
        return;
      }

      router.push("/user");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white sm:p-6">
      <div className="grid min-h-[calc(100vh-2rem)] overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex min-h-[360px] items-center overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#0f766e_54%,#155e75_100%)] px-7 py-10 sm:px-10 lg:min-h-full lg:px-14">
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-white/10 to-transparent" />

          <div className="relative max-w-3xl">
            <h1 className="max-w-2xl text-4xl font-black leading-[1.05] text-white sm:text-5xl lg:text-6xl">
              {welcomeWords.map((word, index) => (
                <span
                  key={word}
                  className="lumex-welcome-word mr-3 inline-block"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  {word}
                </span>
              ))}
            </h1>
            <div className="lumex-welcome-line mt-7 h-1 w-44 rounded-full bg-cyan-200" />
            <div className="mt-8 grid max-w-xl gap-3 text-sm text-slate-100 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="font-semibold text-white">Stock Control</p>
                <p className="mt-1 text-xs text-slate-200">Track lots, locations, and status in one place.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="font-semibold text-white">Secure Access</p>
                <p className="mt-1 text-xs text-slate-200">Department-based workflows for daily operations.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-slate-50 px-5 py-10 text-slate-950 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-white shadow-sm">
                <ShieldCheck className="h-5 w-5 text-cyan-700" />
              </div>
              <div>
                <p className="text-sm font-semibold">IMS Workspace</p>
                <p className="text-xs text-muted-foreground">Secure login</p>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Login</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in to your IMS workspace
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email"
                    className="h-11 rounded-xl"
                    {...register("email", {
                      required: "Email is required.",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Enter a valid email address.",
                      },
                    })}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button type="button" onClick={() => router.push("/forgot-password")} className="text-xs font-medium text-muted-foreground transition hover:text-foreground">
                      Forgot password?
                    </button>
                  </div>

                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter password"
                      className="h-11 rounded-xl pr-11"
                      {...register("password", {
                        required: "Password is required.",
                      })}
                    />
                    <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>

                <Button type="submit" className="h-11 w-full rounded-xl" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
