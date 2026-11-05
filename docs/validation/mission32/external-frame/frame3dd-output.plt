# FRAME3DD ANALYSIS RESULTS  http://frame3dd.sf.net/ VERSION 20140514+ 
# M32 equivalent Euler-Bernoulli beam-column  units N mm tonne 
# Wed Nov  4 09:23:31 2026
# G N U P L O T   S C R I P T   F I L E 
set autoscale
unset border
set pointsize 1.0
set xtics; set ytics; set ztics; 
unset zeroaxis
unset key
unset label
set size ratio -1    # 1:1 2D axis scaling 
# set view equal xyz # 1:1 3D axis scaling 
# NODE NUMBER LABELS
set label ' 1' at   0.0000e+00,   0.0000e+00,   0.0000e+00
set label ' 2' at   0.0000e+00,   0.0000e+00,   2.5000e+02
set label ' 3' at   0.0000e+00,   0.0000e+00,   5.0000e+02
set label ' 4' at   0.0000e+00,   0.0000e+00,   7.5000e+02
set label ' 5' at   0.0000e+00,   0.0000e+00,   1.0000e+03
set label ' 6' at   0.0000e+00,   0.0000e+00,   1.2500e+03
set label ' 7' at   0.0000e+00,   0.0000e+00,   1.5000e+03
set label ' 8' at   0.0000e+00,   0.0000e+00,   1.7500e+03
set label ' 9' at   0.0000e+00,   0.0000e+00,   2.0000e+03
set label ' 10' at   0.0000e+00,   0.0000e+00,   2.2500e+03
set label ' 11' at   0.0000e+00,   0.0000e+00,   2.5000e+03
set label ' 12' at   0.0000e+00,   0.0000e+00,   2.7500e+03
set label ' 13' at   0.0000e+00,   0.0000e+00,   3.0000e+03
set label ' 14' at   0.0000e+00,   0.0000e+00,   3.2500e+03
set label ' 15' at   0.0000e+00,   0.0000e+00,   3.5000e+03
set label ' 16' at   0.0000e+00,   0.0000e+00,   3.7500e+03
set label ' 17' at   0.0000e+00,   0.0000e+00,   4.0000e+03
# ELEMENT NUMBER LABELS
set label ' 1' at   0.0000e+00,   0.0000e+00,   1.2500e+02
set label ' 2' at   0.0000e+00,   0.0000e+00,   3.7500e+02
set label ' 3' at   0.0000e+00,   0.0000e+00,   6.2500e+02
set label ' 4' at   0.0000e+00,   0.0000e+00,   8.7500e+02
set label ' 5' at   0.0000e+00,   0.0000e+00,   1.1250e+03
set label ' 6' at   0.0000e+00,   0.0000e+00,   1.3750e+03
set label ' 7' at   0.0000e+00,   0.0000e+00,   1.6250e+03
set label ' 8' at   0.0000e+00,   0.0000e+00,   1.8750e+03
set label ' 9' at   0.0000e+00,   0.0000e+00,   2.1250e+03
set label ' 10' at   0.0000e+00,   0.0000e+00,   2.3750e+03
set label ' 11' at   0.0000e+00,   0.0000e+00,   2.6250e+03
set label ' 12' at   0.0000e+00,   0.0000e+00,   2.8750e+03
set label ' 13' at   0.0000e+00,   0.0000e+00,   3.1250e+03
set label ' 14' at   0.0000e+00,   0.0000e+00,   3.3750e+03
set label ' 15' at   0.0000e+00,   0.0000e+00,   3.6250e+03
set label ' 16' at   0.0000e+00,   0.0000e+00,   3.8750e+03
# set parametric
# set view 60, 70,  1.00 
# set view equal xyz # 1:1 3D axis scaling 
# unset key
# set xlabel 'x'
# set ylabel 'y'
# set zlabel 'z'
set title "M32 equivalent Euler-Bernoulli beam-column  units N mm tonne \nanalysis file: C:\Users\Usuario\Desktop\jpn-missao31\docs\validation\mission32\external-frame\frame3dd-input.3dd   deflection exaggeration: 1.0   load case 1 of 1 "
unset clip; 
set clip one; set clip two
set xyplane 0 
  plot 'C:\Users\Usuario\AppData\Local\Temp\\frame3dd-output-msh' u 2:3 t 'undeformed mesh' w lp lw 1 lt 5 pt 6, 'C:\Users\Usuario\AppData\Local\Temp\\frame3dd-output-mshf.001' u 1:2 t 'load case 1 of 1' w l lw 1 lt 3
# splot 'C:\Users\Usuario\AppData\Local\Temp\\frame3dd-output-msh' u 2:3:4 t 'load case 1 of 1' w lp  lw 1 lt 5 pt 6, 'C:\Users\Usuario\AppData\Local\Temp\\frame3dd-output-mshf.001' u 1:2:3 t 'load case 1 of 1' w l lw 1 lt 3
