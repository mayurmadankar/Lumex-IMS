"use client";

import { Eye, EyeOff, Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { loginService } from "@/api/services/auth.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md rounded-3xl border shadow-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-background shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">IMS Workspace</p>
              <p className="text-xs text-muted-foreground">Secure login</p>
            </div>
          </div>

          <div>
            <CardTitle className="text-2xl">Login</CardTitle>
            <CardDescription className="mt-1">Sign in to your IMS workspace</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
