import Link from "next/link";

export default function Footer() {
  return (
    <footer id="contact" className="bg-muted/40 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-12 text-sm text-muted-foreground">
          <FooterLink href="mailto:pauljy@stanford.edu">Email</FooterLink>
          <div className="hidden sm:block h-4 w-[1px] bg-muted-foreground/25" />
          <FooterLink href="https://linkedin.com/in/pauljinyoon">LinkedIn</FooterLink>
          <div className="hidden sm:block h-4 w-[1px] bg-muted-foreground/25" />
          <FooterLink href="https://github.com/pauly00n">Github</FooterLink>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link 
      href={href}
      className="text-muted-foreground hover:text-foreground transition-colors duration-200 px-4"
    >
      {children}
    </Link>
  );
}
