export type CadSceneItem=
  |{kind:"line";points:[number,number][];layer:string}
  |{kind:"circle";x:number;y:number;radius:number;layer:string}
  |{kind:"text";x:number;y:number;height:number;value:string;layer:string;alignment?:number;rotation?:number}
  |{kind:"view";x:number;y:number;items:CadSceneItem[];clip?:{width:number;height:number}};
export type CadScene={name:string;title:string;width:number;height:number;items:CadSceneItem[]};
