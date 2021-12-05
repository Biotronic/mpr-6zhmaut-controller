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
    zones: Partial<Zone>[];
}

export class Ramp {
    public id: number;
    public target: Partial<Zone>;
    public step: Partial<Zone>;
    
    constructor(zone: number, attribute: string, target: number, step: number) {
        this.id = zone;
        this.target = {};
        this.step = {};
        this.step[attribute] = step;
        target = Math.max(0, target);
        switch (attribute) {
            case "volume":
                this.target[attribute] = Math.min(38, target);
                break;
            case "treble":
                this.target[attribute] = Math.min(14, target);
                break;
            case "bass":
                this.target[attribute] = Math.min(14, target);
                break;
            case "balance":
                this.target[attribute] = Math.min(20, target);
                break;
        }
    }
    
    public merge(ramp: Ramp) {
        if (ramp.id != this.id) {
            return;
        }
        Object.assign(this.target, ramp.target);
        Object.assign(this.step, ramp.step);
    }
    
    public get finished(): boolean {
        return Object.values(this.target).filter(a => a !== undefined).length == 0;
    }
    
    public next(current: Zone): Partial<Zone> {
        let result = { id: this.id };
        
        for (let i of Object.keys(this.target)) {
            if (current[i] >= this.target[i] && this.step[i] > 0) {
                this.target[i] = this.step[i] = undefined;
            } else if (current[i] <= this.target[i] && this.step[i] < 0) {
                this.target[i] = this.step[i] = undefined;
            } else if (!this.step[i]) {
                this.target[i] = this.step[i] = undefined;
            } else {
                result[i] = current[i] + this.step[i];
            }
        }
        
        return result;
    }
    
    public stop(ramp: Ramp) {
        for (let i of Object.keys(ramp.target)) {
            this.target[i] = this.step[i] = undefined;
        }
    }
}
