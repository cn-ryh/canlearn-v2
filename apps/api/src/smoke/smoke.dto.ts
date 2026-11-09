import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export const smokeModes = ["success", "partial", "blank", "fail"] as const;
export type SmokeMode = (typeof smokeModes)[number];

export class CreateSmokeJob {
  @ApiProperty({ enum: smokeModes })
  @IsIn(smokeModes)
  mode!: SmokeMode;

  @ApiProperty({ minimum: 0, maximum: 15000, type: "integer" })
  @IsInt()
  @Min(0)
  @Max(15000)
  delayMs!: number;
}

export class JobRef {
  @IsUUID("4")
  snapshotId!: string;

  @IsInt()
  @Min(1)
  epoch!: number;
}

export class ClaimReceipt {
  @IsUUID("4")
  claimToken!: string;

  @IsUUID()
  @IsOptional()
  runId?: string;
}

export class ClaimFailure {
  @IsUUID("4")
  claimToken!: string;
}

// Manifest values are validated by the API's deterministic fixture gate.
export class FinishSmokeJob extends JobRef {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => SmokePage)
  pages!: SmokePage[];
}

export class SmokePage {
  @IsInt()
  @Min(1)
  @Max(3)
  pageIndex!: number;

  @IsIn(["success", "blank", "failed", "missing"])
  status!: string;
}
