import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CalendarDays,
	Check,
	Monitor,
	Moon,
	Palette,
	Sun,
	User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChangePasswordCard } from "@/components/profile/ChangePasswordCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersonalization } from "@/hooks/use-personalization";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { apiClient } from "@/lib/api-client";
import type { SuccessEnvelope } from "@/lib/api-error";
import type { User as UserType } from "@/lib/auth-api";
import { currentUserQueryOptions } from "@/lib/auth-api";

export const Route = createFileRoute("/_authenticated/profile/")({
	component: ProfilePage,
});

async function updateProfile(
	userId: string,
	payload: { full_name: string },
): Promise<UserType> {
	const { data } = await apiClient.instance.patch<SuccessEnvelope<UserType>>(
		`/users/${userId}`,
		payload,
	);
	return data.data;
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function ProfilePage() {
	const queryClient = useQueryClient();
	const { data: user } = useQuery(currentUserQueryOptions);

	const [editing, setEditing] = useState(false);
	const [fullName, setFullName] = useState(user?.full_name ?? "");
	const [serverError, setServerError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () => {
			if (!user) {
				throw new Error("User is not loaded");
			}
			return updateProfile(user.id, { full_name: fullName.trim() });
		},
		onSuccess: (updated) => {
			queryClient.setQueryData(currentUserQueryOptions.queryKey, updated);
			setEditing(false);
			setServerError(null);
		},
		onError: () => {
			setServerError("Failed to update profile. Please try again.");
		},
	});

	if (!user) {
		return (
			<div className="flex flex-col gap-6 p-6 max-w-2xl w-full mx-auto">
				{/* Header skeleton */}
				<div>
					<div className="flex items-center gap-2">
						<Skeleton className="size-5 rounded" />
						<Skeleton className="h-5 w-24" />
					</div>
					<Skeleton className="mt-1.5 h-3.5 w-64" />
				</div>
				<Separator />
				{/* Profile card skeleton */}
				<Card>
					<CardHeader>
						<div className="flex items-center gap-4">
							<Skeleton className="size-14 rounded-xl shrink-0" />
							<div className="space-y-2">
								<Skeleton className="h-5 w-36" />
								<Skeleton className="h-3.5 w-24" />
								<div className="flex items-center gap-2 mt-1">
									<Skeleton className="h-5 w-16 rounded-full" />
									<Skeleton className="h-3.5 w-28" />
								</div>
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent className="pt-5">
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<Skeleton className="h-3.5 w-20" />
								<Skeleton className="h-4 w-40 mt-1" />
							</div>
							<div className="flex flex-col gap-1.5">
								<Skeleton className="h-3.5 w-20" />
								<Skeleton className="h-4 w-32 mt-1" />
							</div>
						</div>
					</CardContent>
					<CardFooter className="border-t pt-4">
						<Skeleton className="h-8 w-24 rounded-md" />
					</CardFooter>
				</Card>
				{/* Change password card skeleton */}
				<Card>
					<CardHeader>
						<Skeleton className="h-5 w-36" />
						<Skeleton className="h-3.5 w-64 mt-1" />
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex flex-col gap-1.5">
							<Skeleton className="h-3.5 w-28" />
							<Skeleton className="h-9 w-full rounded-md" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Skeleton className="h-3.5 w-32" />
							<Skeleton className="h-9 w-full rounded-md" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Skeleton className="h-3.5 w-36" />
							<Skeleton className="h-9 w-full rounded-md" />
						</div>
					</CardContent>
					<CardFooter className="border-t pt-4">
						<Skeleton className="h-8 w-32 rounded-md" />
					</CardFooter>
				</Card>
			</div>
		);
	}

	const displayName = user.full_name || user.username;
	const initials = getInitials(displayName);

	const handleEdit = () => {
		setFullName(user.full_name ?? "");
		setServerError(null);
		setEditing(true);
	};

	const handleCancel = () => {
		setEditing(false);
		setServerError(null);
	};

	return (
		<div className="flex flex-col gap-6 p-6 max-w-2xl w-full mx-auto">
			{/* Page header */}
			<div>
				<div className="flex items-center gap-2">
					<User className="size-5 text-primary" />
					<h1 className="text-xl font-semibold">My Profile</h1>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					View and update your account information.
				</p>
			</div>

			<Separator />

			{/* Profile card */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-4">
						<Avatar className="size-14 rounded-xl">
							<AvatarFallback className="rounded-xl bg-primary text-primary-foreground text-lg font-bold">
								{initials}
							</AvatarFallback>
						</Avatar>
						<div>
							<CardTitle className="text-lg">{displayName}</CardTitle>
							<CardDescription className="mt-0.5">
								@{user.username}
							</CardDescription>
							<div className="flex items-center gap-2 mt-2">
								<Badge variant="secondary" className="text-xs">
									{user.role}
								</Badge>
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									<CalendarDays className="size-3" />
									Joined {formatDate(user.created_at)}
								</span>
							</div>
						</div>
					</div>
				</CardHeader>

				<Separator />

				<CardContent className="pt-5">
					<div className="flex flex-col gap-4">
						{/* Full name field */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="full-name">Full name</Label>
							{editing ? (
								<Input
									id="full-name"
									value={fullName}
									onChange={(e) => setFullName(e.target.value)}
									placeholder="Enter your full name"
									autoFocus
								/>
							) : (
								<p className="text-sm py-1.5">
									{user.full_name || (
										<span className="text-muted-foreground italic">
											Not set
										</span>
									)}
								</p>
							)}
						</div>

						{/* Username (read-only) */}
						<div className="flex flex-col gap-1.5">
							<Label>Username</Label>
							<p className="text-sm py-1.5 text-muted-foreground">
								@{user.username}
							</p>
						</div>

						{serverError ? (
							<p className="text-sm text-destructive">{serverError}</p>
						) : null}
					</div>
				</CardContent>

				<CardFooter className="border-t pt-4">
					{editing ? (
						<div className="flex gap-2">
							<Button
								size="sm"
								onClick={() => mutation.mutate()}
								disabled={mutation.isPending || !fullName.trim()}
							>
								{mutation.isPending ? "Saving…" : "Save changes"}
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={handleCancel}
								disabled={mutation.isPending}
							>
								Cancel
							</Button>
						</div>
					) : (
						<Button size="sm" variant="outline" onClick={handleEdit}>
							Edit profile
						</Button>
					)}
				</CardFooter>
			</Card>

			{/* Personalization Settings Card */}
			<PersonalizationCard />

			{/* Change Password card */}
			<ChangePasswordCard mustChange={user.must_change_password} />
		</div>
	);
}

function PersonalizationCard() {
	const { mode, set: setTheme } = useThemeMode();
	const { accent, compact, setAccent, setCompact } = usePersonalization();

	const accents: Array<{
		id: "lime" | "blue" | "purple" | "orange";
		label: string;
		colorClass: string;
	}> = [
		{ id: "lime", label: "Lime", colorClass: "bg-[#9ed957]" },
		{ id: "blue", label: "Blue", colorClass: "bg-[#2563eb]" },
		{ id: "purple", label: "Purple", colorClass: "bg-[#7c3aed]" },
		{ id: "orange", label: "Orange", colorClass: "bg-[#ea580c]" },
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg flex items-center gap-2">
					<Palette className="size-4.5 text-primary" />
					Theme & Personalization
				</CardTitle>
				<CardDescription>
					Customize Paca's theme, colors, and layout spacing.
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="pt-5 space-y-6">
				{/* Theme Selector */}
				<div className="flex flex-col gap-2.5">
					<Label>Theme Mode</Label>
					<div className="flex rounded-lg border border-border p-1 bg-muted/40 w-fit">
						{(["light", "dark", "auto"] as const).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setTheme(m)}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
									mode === m
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{m === "light" && <Sun className="size-3.5" />}
								{m === "dark" && <Moon className="size-3.5" />}
								{m === "auto" && <Monitor className="size-3.5" />}
								<span className="capitalize">{m}</span>
							</button>
						))}
					</div>
				</div>

				{/* Accent Color Selector */}
				<div className="flex flex-col gap-2.5">
					<Label>Accent Color</Label>
					<div className="flex items-center gap-3">
						{accents.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => setAccent(item.id)}
								className={`group relative size-7 rounded-full flex items-center justify-center cursor-pointer transition-transform duration-150 hover:scale-110 ${item.colorClass}`}
								title={item.label}
							>
								{accent === item.id && (
									<Check className="size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] font-bold" />
								)}
								<span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-popover px-1.5 py-0.5 rounded border shadow-sm whitespace-nowrap pointer-events-none">
									{item.label}
								</span>
							</button>
						))}
					</div>
				</div>

				{/* Compact Mode Switch */}
				<div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
					<div className="space-y-0.5">
						<Label htmlFor="compact-mode" className="text-sm font-medium">
							Compact Mode
						</Label>
						<p className="text-xs text-muted-foreground">
							Reduces padding and gaps by 20% to fit more content.
						</p>
					</div>
					<button
						id="compact-mode"
						type="button"
						role="switch"
						aria-checked={compact}
						onClick={() => setCompact(!compact)}
						className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
							compact ? "bg-primary" : "bg-muted-foreground/30"
						}`}
					>
						<span
							className={`pointer-events-none inline-block size-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
								compact ? "translate-x-5" : "translate-x-0"
							}`}
						/>
					</button>
				</div>

				{/* Onboarding Tour Reset */}
				<div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
					<div className="space-y-0.5">
						<Label className="text-sm font-medium">Onboarding Tour</Label>
						<p className="text-xs text-muted-foreground">
							Relaunch the interactive tour to review Paca's core concepts.
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							localStorage.removeItem("paca-tour-completed");
							window.dispatchEvent(new CustomEvent("reset-onboarding-tour"));
							toast.success("Onboarding tour restarted!");
						}}
						className="text-xs font-semibold cursor-pointer active:scale-95 transition-all"
					>
						Restart Tour
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
