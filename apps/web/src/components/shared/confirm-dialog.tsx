import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void;
	isPending?: boolean;
	variant?: "default" | "destructive";
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmText = "Confirm",
	cancelText = "Cancel",
	onConfirm,
	isPending = false,
	variant = "destructive",
}: ConfirmDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 mb-2">
						<AlertTriangle className="size-5 text-destructive" />
					</div>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose
						render={
							<Button variant="outline" size="sm" disabled={isPending} />
						}
					>
						{cancelText}
					</DialogClose>
					<Button
						variant={variant}
						size="sm"
						disabled={isPending}
						onClick={onConfirm}
					>
						{isPending ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : null}
						{confirmText}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
