/**
 * @typedef {'kun'|'zhen'|'kan'|'dui'|'gen'|'li'|'xun'|'qian'} TrigramKind
 * @typedef {'qian'|'dui'|'li'|'zhen'|'xun'|'kan'|'gen'|'kun'} Palace
 * @typedef {6|7|8|9} LineType
 * @typedef {'manual'|'threeCoins'|'plumTime'|'plumNumbers'|'plumRandom'|'hexagramLibrary'} CastMethod
 * @typedef {{kind: TrigramKind}} Trigram
 * @typedef {{kingWenNumber:number,name:string,fullName:string,lines:number,palace:Palace}} Hexagram
 * @typedef {{judgementText:string,lineTexts:string[],divinationText:string,extraLine:string|null}} HexagramContent
 * @typedef {{method:CastMethod,originalLines:LineType[],original:Hexagram,changed:Hexagram,mutual:Hexagram}} CastResult
 * @typedef {{body:Trigram,use:Trigram}} BodyUse
 * @typedef {'user'|'assistant'} DialogueRole
 * @typedef {{id:string,role:DialogueRole,content:string,reasoning:string}} DialogueTurn
 * @typedef {{promptTokens:number,completionTokens:number,totalTokens:number,cacheHitTokens:number,cacheMissTokens:number,costCNY:number|null}} TokenUsage
 * @typedef {{id:string,date:string,method:CastMethod,originalLines:LineType[],question:string,aiAnswer:string,transcript:DialogueTurn[],aiUsage:TokenUsage|null,model:string|null,provider:string|null}} CastRecord
 * @typedef {{model:string,usage:TokenUsage,count:number}} UsageByModel
 * @typedef {{requestCount:number,promptTokens:number,completionTokens:number,totalTokens:number,cacheHitTokens:number,cacheMissTokens:number,estimatedCostCNY:number,byModel:UsageByModel[]}} UsageSummary
 */

export {}
