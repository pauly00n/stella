"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { ModeToggle } from "./mode-toggle";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import Image from "next/image";
import { useTheme } from "next-themes";
export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const NavLink = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => {
    const isActive = pathname === href;
    
    return (
      <Link 
        href={href} 
        className={cn(
          "text-sm md:text-base font-medium transition-colors relative",
          "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full",
          "after:origin-left after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300",
          isActive ? "text-primary after:bg-primary after:scale-x-100" : "text-muted-foreground hover:text-foreground after:bg-primary/70",
          className
        )}
      >
        {children}
      </Link>
    );
  };

  return (
    <header 
      className={cn(
        "sticky top-0 z-40 w-full transition-all duration-200",
        scrolled ? "bg-background/80 backdrop-blur-md border-b" : "bg-transparent"
      )}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-4xl">
        <Link href="/" className="flex items-center gap-2 animate-fade-in" style={{marginLeft: '0'}}>
          <Image 
            src={mounted && theme === 'dark' ? '/icon-dark.png' : '/icon-light.png'}
            alt="PY Logo"
            width={32}
            height={32}
            priority
          />
        </Link>
        
        <nav className="hidden md:flex items-center space-x-8">
          <NavLink href="/">Home</NavLink>
          <NavLink href="/about">About</NavLink>
          <NavLink href="/resume.pdf">Resume</NavLink>
          <ModeToggle />
        </nav>
        
        <div className="md:hidden flex items-center gap-4">
          <ModeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-8">
              <DropdownMenuItem>
                <NavLink href="/">Home</NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <NavLink href="/about">About</NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <NavLink href="/resume.pdf">Resume</NavLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
