import { ProjectsNav } from "@/components/projects/projects-nav";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <ProjectsNav />
      {children}
    </div>
  );
}
