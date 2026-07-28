export type PaletteId="sage"|"rose"|"night";
export interface RoomObject{id:string;type:"bed"|"desk"|"shelf"|"rug"|"plant"|"letter"|"lamp";x:number;y:number;z?:number;variant?:string}
export interface RoomDocument{schemaVersion:1;rendererVersion:1;id:string;seed:string;palette:PaletteId;layout:"corner";objects:RoomObject[];provenance:{generatedImageModel:false;stylePack:string}}
