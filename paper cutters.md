paper cutters

1.) MAke a simulation of the game where two agents exchange collections of rectangles. This will be a list of tuples.
2.) To act on a list of tupples, the player must remove a tupple, divide it, and push those tupples back onto the list. 
3,) to devide a tupple nxm. one must select x and y such that
    0<x<x
    0<y<m
    This prduces tupples (0,0) (x, y) (n-x, y), (x, m-y), (n-x, m-y)
4.) an agent will return a list of tupples if he can move successfully, and None if he can't. Whenever a plater recieves None, that means he wins,

Enumerate the tupple sequence, split them into player 1 wins and player 2 wins.                                      slice the first 5 elememts and enumerate distinct sequences
 
(5, 3) -> (0,0) (4, 2) (1, 2) (4, 1), (1, 1)


Class Player
0
00
