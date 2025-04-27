export class Cubic {
  constructor(private curves: number[]) {}
  getValue(time: number): number {
    let start = 0, end = 1, mid = 0;
    let startGrad = 0, endGrad = 0;
    if (time <= 0) {
      startGrad = this.curves[0] > 0
        ? this.curves[1]/this.curves[0]
        : (this.curves[1]===0 && this.curves[2]>0
          ? this.curves[3]/this.curves[2] : 0);
      return startGrad * time;
    }
    if (time >= 1) {
      endGrad = this.curves[2] < 1
        ? (this.curves[3]-1)/(this.curves[2]-1)
        : (this.curves[2]===1 && this.curves[0]<1
          ? (this.curves[1]-1)/(this.curves[0]-1) : 0);
      return 1 + endGrad * (time - 1);
    }
    while (start < end) {
      mid = (start+end)/2;
      const xEst = Cubic.calculate(this.curves[0], this.curves[2], mid);
      if (Math.abs(time - xEst) < 0.00001) {
        return Cubic.calculate(this.curves[1], this.curves[3], mid);
      }
      if (xEst < time) start = mid;
      else end = mid;
    }
    return Cubic.calculate(this.curves[1], this.curves[3], mid);
  }
  static calculate(a: number, b: number, m: number): number {
    return 3*a*(1-m)*(1-m)*m + 3*b*(1-m)*m*m + m*m*m;
  }
}
