import { prisma } from "@/lib/prisma";

/** The fair an open registration link belongs to - for link previews (WhatsApp etc.). */
export async function registrationEdition(token: string) {
  try {
    return await prisma.ksefEdition.findUnique({
      where: { registrationToken: token },
      select: { name: true, registrationClosesAt: true },
    });
  } catch {
    return null;
  }
}
