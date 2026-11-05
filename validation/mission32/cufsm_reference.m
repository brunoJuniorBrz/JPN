function cufsm_reference(input_file, output_file, source_directory)
  % Compatibility syntax warning only; numerical warnings remain enabled.
  warning('off','Octave:possible-matlab-short-circuit-operator');
  % Independent ORIGINAL CUFSM assembly and modal kinematics; headless driver.
  % No pyCUFSM matrices or modal bases are read here. SI-derived mm/MPa inputs.
  addpath(genpath(fullfile(source_directory, 'analysis')));
  load(input_file);  % node, elem, prop, wavelength: one-based CUFSM indexing
  nnodes = rows(node); nelems = rows(elem); a = wavelength; BC = 'S-S'; m_a = 1;
  elprop = elemprop(node, elem, nnodes, nelems);
  K = zeros(4*nnodes); Kg = K;
  for i = 1:nelems
    ni = elem(i,2); nj = elem(i,3); t = elem(i,4); b = elprop(i,2);
    mat = prop(find(prop(:,1)==elem(i,5)),:);
    kl = klocal(mat(2),mat(3),mat(4),mat(5),mat(6),t,a,b,BC,m_a);
    gl = kglocal(a,b,node(ni,8)*t,node(nj,8)*t,BC,m_a);
    [k,g] = trans(elprop(i,3),kl,gl,m_a);
    [K,Kg] = assemble(K,Kg,k,g,ni,nj,nnodes,m_a);
  end
  [natural,ng,nd,nl] = base_column(node,elem,prop,a,BC,m_a);
  [ep,main,meta,nodeprops,nm,nc,ns,nd2,nl2,perm] = base_properties(node,elem);
  [rx,rz,rp,ryd,rys,rud] = mode_constr(node,elem,prop,nodeprops,main,meta,perm,1,a,BC);
  [dy,ng2] = yDOFs(node,elem,main,nm,nd,ryd,rud);
  basis = base_update(1,1,natural,a,m_a,node,elem,prop,ng,nd,nl,BC,1,1);
  Blocal = mode_select(basis,ng,nd,nl,zeros(1,ng),zeros(1,nd),ones(1,nl),zeros(1,2*(nnodes-1)),4*nnodes,m_a);
  Bdist = mode_select(basis,ng,nd,nl,zeros(1,ng),ones(1,nd),zeros(1,nl),zeros(1,2*(nnodes-1)),4*nnodes,m_a);
  % Cholesky whitening, rather than Python's generalized-eigh implementation.
  [local_value,local_mode,local_residual] = reference_pair(K,Kg,Blocal);
  [dist_value,dist_mode,dist_residual] = reference_pair(K,Kg,Bdist);
  save('-mat7-binary',output_file,'K','Kg','Blocal','Bdist','local_value','local_mode','local_residual','dist_value','dist_mode','dist_residual','main','nodeprops','perm','rx','rz','rp','ryd','rys','rud','dy','natural');
end

function [critical,mode,residual] = reference_pair(K,G,B)
  [Q,S,V] = svd(B,'econ');
  assert(min(diag(S)) > max(size(B))*eps*max(diag(S)));
  k = Q'*K*Q; g = Q'*G*Q; k = (k+k')/2; g = (g+g')/2;
  R = chol(k); h = (R'\g)/R; h = (h+h')/2;
  [vectors,values] = eig(h); [mu,index] = max(diag(values)); assert(mu>0);
  v = R\vectors(:,index); critical = 1/mu; mode = Q*v;
  residual = norm(k*v-critical*g*v)/(norm(k*v)+critical*norm(g*v));
end
