import {DemoWorkspace} from "@/components/demonstration/demo-workspace";

export default async function DemonstrationPage({searchParams}:{searchParams:Promise<{projeto?:string}>}){
  const {projeto}=await searchParams;
  return <DemoWorkspace projectId={projeto}/>;
}
