import {
  validate,
  IsInt,
  IsBoolean,
  Min,
  Max,
  IsIn
} from 'class-validator';

function range(from: number, to: number) {
    var result = [];
    for (let i = from; i <= to; ++i) {
        result.push(i + from);
    }
    return result;
}

export class Zone {
    @IsIn([11,12,13,14,15,16,
           21,22,23,24,25,26,
           31,32,33,34,35,36])
    id: number;
    
    name: string;
    description: string;
    
    @IsBoolean()
    pa: boolean = false;
    
    @IsBoolean()
    power: boolean = false;
    
    @IsBoolean()
    mute: boolean = false;
    
    @IsBoolean()
    dnd: boolean = false;
    
    @IsIn(range(0, 38))
    volume: number = 20;
    
    @IsIn(range(0, 14))
    treble: number = 7;
    
    @IsIn(range(0, 14))
    bass: number = 7;
    
    @IsIn(range(0, 20))
    balance: number = 10;
    
    @IsIn(range(1, 6))
    source: number = 1;
}

export class Source {
    @IsIn(range(1, 6))
    id: number;
    
    @IsBoolean()
    enabled: boolean;
    
    name: string;
    description: string;
}

export class Scenario {
    @IsInt()
    @Min(1)
    id: number;
    
    name: string;
    description: string;
    zones: Zone[];
}

export class Ramp {
    zone: number;
    attribute: string;
    next: number;
    step: number;
    target: number;
    enabled: boolean;
}

export function test() {
    var zone = new Zone();
    Object.assign(zone, {
        id: 11
    });

    validate(zone).then(errors => {
        console.log(errors);
    });
}