import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { localParsePageCount } from "./local-parse.dto.js";

// 内部回执：只在 /v1/internal/local-parse 暴露，不进入公开 Swagger 或本地契约。
export class LocalParseReceipt {
  @IsUUID("4")
  snapshotId!: string;

  @IsInt()
  @Min(1)
  epoch!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(localParsePageCount)
  @ValidateNested({ each: true })
  @Type(() => LocalParseReceiptPage)
  pages!: LocalParseReceiptPage[];
}

export class LocalParseReceiptPage {
  @IsInt()
  @Min(1)
  pageIndex!: number;

  @IsIn(["success", "blank", "failed", "missing"])
  status!: "success" | "blank" | "failed" | "missing";
}
