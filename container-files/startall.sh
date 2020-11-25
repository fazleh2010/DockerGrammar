mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld/
mysqld &

cd /tmp/server && isql-v 1111 dba dba fctinstall.db

sleep 10 && mysql < /tmp/server/schema.sql &

cd /tmp/server/
npm start 
