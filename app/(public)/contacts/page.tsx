"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { contactFormSchema, type ContactFormInput } from "@/lib/validations";
import { apiPost } from "@/lib/api-client";

export default function ContactsPage() {
  const [submitting, setSubmitting] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormInput>({ resolver: zodResolver(contactFormSchema) });

  async function onSubmit(values: ContactFormInput) {
    setSubmitting(true);
    try {
      await apiPost("/api/contact", values);
      toast.success("Message sent. We'll get back to you shortly.");
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <Mail className="h-8 w-8 text-primary" />
          <CardTitle>Get in touch</CardTitle>
          <CardDescription>Questions about a championship, subscription, or a bug report - we read every message.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" className="mt-1.5" {...register("name")} />
                {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" className="mt-1.5" {...register("email")} />
                {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>}
              </div>
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" className="mt-1.5" {...register("phone")} />
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" className="mt-1.5" {...register("subject")} />
              {errors.subject && <p className="mt-1 text-sm text-red-400">{errors.subject.message}</p>}
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" className="mt-1.5" rows={5} {...register("message")} />
              {errors.message && <p className="mt-1 text-sm text-red-400">{errors.message.message}</p>}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Sending..." : "Send message"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
