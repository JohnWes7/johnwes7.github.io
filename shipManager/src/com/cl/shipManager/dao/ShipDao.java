package com.cl.shipManager.dao;

import java.util.List;

import com.cl.shipManager.entity.Ship;

public interface ShipDao {
	/*��ѯ����*/
	public List<Ship> findAll(String shipId);
	/*��ֻ����*/
	public boolean delShip(int id);
	/*��ֻ��Ϣ�޸�*/
	public boolean updShip(Ship ship);
	/*��ֻ���*/
	public boolean addShip(Ship ship);
	/*������ѯ��ֻ��Ϣ*/
	
	

}