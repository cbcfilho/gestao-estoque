import { redirect } from "next/navigation";

export default function Home() {
  // O middleware já manda para /login quem não tem sessão.
  redirect("/painel");
}
