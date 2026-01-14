import { Card, CardContent } from "@/components/ui/card";
import Image from 'next/image';
import { FaPython, FaReact } from "react-icons/fa";
import { SiGit, SiLatex, SiTypescript, SiJavascript, SiPandas, SiScikitlearn, SiPytorch, SiCplusplus, SiApachespark, SiJupyter, SiQt } from "react-icons/si";
import { PiFileHtmlDuotone } from "react-icons/pi";
import { TbBrandReactNative } from "react-icons/tb";
import { RiNextjsFill, RiSupabaseFill } from "react-icons/ri";
import { VscVscode } from "react-icons/vsc";

export default function Home() {

  return (
    <div className="container mx-auto px-4 py-12 md:py-12 max-w-4xl animate-fade-in min-h-screen flex items-center">
      <section className="space-y-4">
        {/* Hero */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-full blur-sm"></div>
            <Image
              src="/new-profile-image2.JPG"
              alt="Paul Yoon"
              width={160}
              height={160}
              priority
              className="h-40 w-40 rounded-full border-4 border-background"
            />
          </div>
          
          <div className="space-y-4 text-center md:text-left mt-8 md:mt-12">
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                Hi! I'm Paul Yoon.
              </h1>
            </div>
            
          </div>
        </div>
        
        {/* About Blurb Shit Thing*/}
        <Card className="border border-border/40 bg-card/80">
          <CardContent className="p-6 space-y-4">
            <p className="text-lg text-muted-foreground leading-relaxed">
              I'm a third year undergraduate at <span className="font-medium text-foreground">Stanford University</span> studying <span className="font-medium text-foreground">Mathematics and Computer Science</span>.
              I strive to find meaning through my work, whether I'm building projects, conducting research, or learning new things. 
            </p>
          </CardContent>
        </Card>
        
        {/* Current Stuff */}
        <Card className="border border-border/40 bg-card/80">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Currently</h2>   
            <div className="space-y-1 sm:space-y-1">
              <p className="text-lg text-muted-foreground leading-relaxed">
                • Working on <a href="/stella" className="font-medium text-primary underline-offset-4 hover:underline transition-all" >Stella</a> at Stanford's Center for <a href="https://aimi.stanford.edu/" className="font-medium text-primary underline-offset-4 hover:underline transition-all" >Artificial Intelligence in Medicine &amp; Imaging</a>
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                • Teaching Assistant for Stanford's <a href="https://bulletin.stanford.edu/courses/1172891" className="font-medium text-primary underline-offset-4 hover:underline transition-all"> Applied Matrix Theory (MATH 104)</a>
              </p>

            </div>
          </CardContent>
        </Card>

        {/* Former Stuff */}
        <Card className="border border-border/40 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Previously</h2>   
            <div className="space-y-1 sm:space-y-1">
              <p className="text-lg text-muted-foreground leading-relaxed">
                • Teaching Assistant for Stanford's <a href="https://bulletin.stanford.edu/courses/1172271" className="font-medium text-primary underline-offset-4 hover:underline transition-all"> Intro to Calculus (MATH 19)</a>
              </p>

              <p className="text-lg text-muted-foreground leading-relaxed">
                • Researcher at Stanford's Undergraduate Resesarch Institute in Mathematics <a href="https://surim.stanford.edu/" className="font-medium text-primary underline-offset-4 hover:underline transition-all" >(SURIM)</a>
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                • Data Science Intern at <a href="https://sundial.so" className="font-medium text-primary underline-offset-4 hover:underline transition-all">Sundial</a>, building automated data insights
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                • Tutor at <a href="http://wunderlinglearning.com" className="font-medium text-primary underline-offset-4 hover:underline transition-all">Wunderling Learning</a>, for students with Learning Disabilities
              </p>

              <p className="text-lg text-muted-foreground leading-relaxed">
                • Research Assistant at the <a href="https://med.stanford.edu" className="font-medium text-primary underline-offset-4 hover:underline transition-all">Stanford School of Medicine</a>, for knee pain imaging
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                • Presenter at the <a href="https://snmmi.org" className="font-medium text-primary underline-offset-4 hover:underline transition-all">Society 
              of Nuclear Medicine and Molecular Imaging</a>
              </p>

            </div>
          </CardContent>
        </Card>

        {/* Skills */}
        <Card className="border border-border/40 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Skills</h2>   
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

              <div>
                <h3 className="text-lg font-medium mb-1">Languages</h3>
                <div className="space-y-1">
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <FaPython/> Python</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiLatex/> LaTeX</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiJavascript/> JavaScript</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiTypescript/> TypeScript</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <PiFileHtmlDuotone/> HTML/CSS</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiCplusplus/> C++</p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-1">Frameworks / Libraries</h3>
                <div className="space-y-1">
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <FaReact/> React</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <TbBrandReactNative/> React Native</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <RiNextjsFill/> Next.js</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiPandas/> Pandas</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiScikitlearn/> Scikit-Learn</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiPytorch/> PyTorch</p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-1">Developer Tools</h3>
                <div className="space-y-1">
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiGit/> Git & Github</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <VscVscode/> VS Code</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiApachespark/> Apache Spark</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <RiSupabaseFill/> Supabase</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiJupyter/> Jupyter Notebook</p>
                  <p className="text-muted-foreground leading-relaxed flex items-center gap-2"> <SiQt/> Qt Creator</p>
                </div>
              </div>
          </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
